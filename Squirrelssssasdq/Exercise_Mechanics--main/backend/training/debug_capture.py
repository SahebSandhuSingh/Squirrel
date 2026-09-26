"""Atomic, analysis-oriented capture of every accepted live-training frame.

This recorder deliberately sits outside rule kernels and scoring. It persists the exact
validated input and the adapter's matching rule snapshot without changing either result.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from copy import deepcopy
from pathlib import Path

from backend.core.frame import TrainingFrame
from backend.core.landmarks import ALL_LANDMARKS

CAPTURE_SCHEMA_VERSION = 1
SET_SUMMARY_SCHEMA_VERSION = 1
MISSING_VALUE = "nan"

_REP_DIRECTORY = re.compile(r"^rep_(\d+)$")


class TrainingDebugCapture:
    """Persist one socket's live frames under collision-safe rep directories.

    A reconnect never overwrites an earlier capture: it starts at the next available rep
    directory. In-session rep boundaries are supplied by the exercise adapter because only the
    exercise owns the meaning of its reset/setup lifecycle.
    """

    def __init__(
        self,
        set_dir: Path,
        *,
        exercise_id: str,
        set_no: int,
        runtime_metadata: dict,
    ) -> None:
        self._set_dir = set_dir
        self._exercise_id = exercise_id
        self._set_no = set_no
        self._runtime_metadata = deepcopy(runtime_metadata)
        fsm = self._runtime_metadata.get("fsm")
        self._movement_type = fsm.get("movement_type") if isinstance(fsm, dict) else None
        if self._movement_type not in {"reps", "time"}:
            raise ValueError("runtime metadata must declare fsm.movement_type")
        if self._movement_type == "reps":
            self._timed_phases = _configured_phases(self._runtime_metadata)
            self._movement_phases = _configured_movement_phases(
                self._runtime_metadata,
                self._timed_phases,
            )
        else:
            self._timed_phases = ()
            self._movement_phases = ()
        self._rep_no: int | None = None
        self._frame_no = 0
        self._metadata_written_for: set[int] = set()
        self._set_summary_path = set_dir / "set_summary.json"
        self._set_started_t_ms: float | None = None
        self._cycle_started_t_ms: float | None = None
        self._previous_t_ms: float | None = None
        self._previous_phase: str | None = None
        self._phase_duration_ms = _empty_phase_durations(self._timed_phases)
        self._rep_summaries: list[dict] = []
        self._restore_set_summary()

    @property
    def rep_no(self) -> int | None:
        return self._rep_no

    @property
    def frame_no(self) -> int:
        return self._frame_no

    def record(
        self,
        frame: TrainingFrame,
        status: dict,
        debug_snapshot: dict,
    ) -> tuple[Path, Path]:
        """Write matching keypoint/rule documents and any completed-attempt score."""
        if self._movement_type == "time":
            return self._record_timed(frame, status, debug_snapshot)
        phase = status.get("phase")
        if phase not in self._timed_phases:
            raise ValueError("status phase is not a supported timed phase")
        self._advance_timing(frame.t_ms)
        events = status.get("events")
        cycle_completed = bool(
            isinstance(events, dict) and events.get("rep_cycle_completed") is True
        )
        set_cycle_completed = bool(
            isinstance(events, dict) and events.get("set_cycle_completed") is True
        )

        if debug_snapshot.get("start_new_rep") is True:
            self._close_cycle(frame.t_ms, status, complete_set=False)
            self._rep_no = None
            self._frame_no = 0
            self._start_cycle(frame.t_ms)

        if self._set_started_t_ms is None:
            self._set_started_t_ms = frame.t_ms
        if self._cycle_started_t_ms is None:
            self._start_cycle(frame.t_ms)

        rep_no = self._ensure_rep_number()
        self._frame_no += 1
        rep_dir = self._set_dir / f"rep_{rep_no}"
        self._write_metadata(rep_dir)

        keypoint_path = rep_dir / "keypoints" / f"frame_{self._frame_no}.json"
        rule_path = rep_dir / "rules" / f"frame_{self._frame_no}.json"
        keypoint_document = {
            "schema_version": CAPTURE_SCHEMA_VERSION,
            "exercise": self._exercise_id,
            "set": self._set_no,
            "rep": rep_no,
            "frame": self._frame_no,
            "t_ms": frame.t_ms,
            "phase": phase,
            "keypoints": _complete_keypoint_schema(frame.keypoints),
        }
        status_snapshot = deepcopy(status)
        set_status = status_snapshot.pop("set", None)
        rule_document = {
            **status_snapshot,
            "schema_version": CAPTURE_SCHEMA_VERSION,
            "exercise": self._exercise_id,
            "set": self._set_no,
            "set_status": set_status,
            "rep": rep_no,
            "frame": self._frame_no,
            "t_ms": frame.t_ms,
            "phase": phase,
            "rules": deepcopy(debug_snapshot.get("rules", {})),
            # Capture-only FSM instrumentation: which progress predicates held on this frame and
            # which transitions ran. Never sent over the socket — it exists so a rig session can be
            # analyzed after the fact instead of re-run.
            "fsm": deepcopy(debug_snapshot.get("fsm", {})),
        }

        # Keypoints are written first so a rule result never exists without its source frame.
        _atomic_write_json(keypoint_path, keypoint_document)
        _atomic_write_json(rule_path, rule_document)
        self._write_attempt_result(rep_dir, rule_document)
        self._previous_t_ms = frame.t_ms
        self._previous_phase = phase

        if cycle_completed and not debug_snapshot.get("start_new_rep"):
            self._close_cycle(frame.t_ms, status, complete_set=set_cycle_completed)
        elif self._set_summary_path.exists() is False:
            self._write_set_summary(frame.t_ms, status, complete=False)
        return keypoint_path, rule_path

    def _record_timed(
        self,
        frame: TrainingFrame,
        status: dict,
        debug_snapshot: dict,
    ) -> tuple[Path, Path]:
        """Persist a continuous duration set without manufacturing rep directories."""
        phase = status.get("phase")
        if not isinstance(phase, str) or not phase:
            raise ValueError("timed status phase must be a non-empty string")
        set_status = status.get("set")
        movement = status.get("movement")
        events = status.get("events")
        if (
            not isinstance(set_status, dict)
            or set_status.get("movement_type") != "time"
            or not isinstance(movement, dict)
            or not isinstance(events, dict)
            or not isinstance(events.get("lift_cycles"), list)
        ):
            raise ValueError("timed status must contain set, movement and lift-cycle events")
        if self._previous_t_ms is not None and frame.t_ms < self._previous_t_ms:
            raise ValueError("capture timestamps must be monotonic")
        if self._set_started_t_ms is None:
            self._set_started_t_ms = frame.t_ms
        self._frame_no += 1
        self._write_timed_metadata()

        keypoint_path = self._set_dir / "frames" / "keypoints" / f"frame_{self._frame_no}.json"
        rule_path = self._set_dir / "frames" / "rules" / f"frame_{self._frame_no}.json"
        identity = {
            "schema_version": CAPTURE_SCHEMA_VERSION,
            "exercise": self._exercise_id,
            "set": self._set_no,
            "frame": self._frame_no,
            "t_ms": frame.t_ms,
            "phase": phase,
        }
        _atomic_write_json(
            keypoint_path,
            {**identity, "keypoints": _complete_keypoint_schema(frame.keypoints)},
        )
        status_snapshot = deepcopy(status)
        captured_set = status_snapshot.pop("set")
        rule_document = {
            **status_snapshot,
            **identity,
            "set_status": captured_set,
            "rules": deepcopy(debug_snapshot.get("rules", {})),
            "fsm": deepcopy(debug_snapshot.get("fsm", {})),
        }
        _atomic_write_json(rule_path, rule_document)
        for event in events["lift_cycles"]:
            if not isinstance(event, dict):
                raise ValueError("timed lift-cycle events must be mappings")
            lift_id = event.get("lift_id")
            if not isinstance(lift_id, int) or isinstance(lift_id, bool) or lift_id < 1:
                raise ValueError("timed lift-cycle event ids must be positive integers")
            _atomic_write_json(
                self._set_dir / "lift_events" / f"lift_{lift_id}.json",
                {**identity, "event": deepcopy(event)},
            )
        self._previous_t_ms = frame.t_ms
        self._previous_phase = phase
        self._write_timed_set_summary(status)
        return keypoint_path, rule_path

    def _write_timed_metadata(self) -> None:
        path = self._set_dir / "metadata.json"
        if path.is_file():
            return
        _atomic_write_json(
            path,
            {
                "schema_version": CAPTURE_SCHEMA_VERSION,
                "exercise": self._exercise_id,
                "set": self._set_no,
                "missing_value": MISSING_VALUE,
                "landmark_schema": list(ALL_LANDMARKS),
                **deepcopy(self._runtime_metadata),
            },
        )

    def _write_timed_set_summary(self, status: dict) -> None:
        set_status = status["set"]
        movement = status["movement"]
        score = status.get("score")
        document = {
            "schema_version": SET_SUMMARY_SCHEMA_VERSION,
            "movement_type": "time",
            "exercise": self._exercise_id,
            "set": self._set_no,
            "status": "complete" if set_status.get("complete") is True else "in_progress",
            "target_duration_ms": set_status.get("target_duration_ms"),
            "elapsed_ms": set_status.get("elapsed_ms"),
            "remaining_ms": set_status.get("remaining_ms"),
            "started_t_ms": self._set_started_t_ms,
            "completed_t_ms": self._previous_t_ms if set_status.get("complete") is True else None,
            "set_duration_ms": set_status.get("elapsed_ms"),
            **deepcopy(movement),
            "average_form_score": (
                score.get("score") if isinstance(score, dict) else None
            ),
            "score": deepcopy(score) if isinstance(score, dict) else None,
            "monitors": deepcopy(status.get("monitors", {})),
        }
        _atomic_write_json(self._set_summary_path, document)

    def _advance_timing(self, now_ms: float) -> None:
        if self._previous_t_ms is None or self._previous_phase is None:
            return
        delta = float(now_ms) - self._previous_t_ms
        if delta < 0:
            raise ValueError("capture timestamps must be monotonic")
        self._phase_duration_ms[self._previous_phase] += delta

    def _start_cycle(self, now_ms: float) -> None:
        self._cycle_started_t_ms = float(now_ms)
        self._phase_duration_ms = _empty_phase_durations(self._timed_phases)

    def _close_cycle(self, now_ms: float, status: dict, *, complete_set: bool) -> None:
        if self._cycle_started_t_ms is None:
            return
        duration = max(0.0, float(now_ms) - self._cycle_started_t_ms)
        phases = {
            phase: round(self._phase_duration_ms[phase], 6)
            for phase in self._timed_phases
        }
        movement_duration = round(
            sum(phases[phase] for phase in self._movement_phases),
            6,
        )
        rep_timing = {
            "rep_duration_ms": round(duration, 6),
            "phase_duration_ms": phases,
            "movement_duration_ms": movement_duration,
        }
        if self._rep_no is None:
            return
        rep_dir = self._set_dir / f"rep_{self._rep_no}"
        score_path = rep_dir / "form_score.json"
        if score_path.is_file():
            score = _read_json_mapping(score_path)
            attempt = score.get("last_attempt")
            if isinstance(attempt, dict) and attempt.get("qualified") is True:
                score.update(deepcopy(rep_timing))
                _atomic_write_json(score_path, score)
                qualified_rep = attempt.get("rep")
                summary = {
                    "rep": qualified_rep,
                    "artifact_rep": self._rep_no,
                    "classification": attempt.get("classification"),
                    **deepcopy(rep_timing),
                    "final_score": score.get("final_score"),
                }
                self._rep_summaries = [
                    row for row in self._rep_summaries if row.get("rep") != qualified_rep
                ]
                self._rep_summaries.append(summary)
                self._rep_summaries.sort(key=lambda row: int(row["rep"]))
        self._write_set_summary(now_ms, status, complete=complete_set)
        self._cycle_started_t_ms = None
        self._phase_duration_ms = _empty_phase_durations(self._timed_phases)

    def _write_set_summary(self, now_ms: float, status: dict, *, complete: bool) -> None:
        set_status = status.get("set")
        if not isinstance(set_status, dict):
            raise ValueError("status.set must be a mapping")
        if self._set_started_t_ms is None:
            self._set_started_t_ms = float(now_ms)
        scores = [
            float(row["final_score"])
            for row in self._rep_summaries
            if isinstance(row.get("final_score"), (int, float))
            and not isinstance(row.get("final_score"), bool)
        ]
        document = {
            "schema_version": SET_SUMMARY_SCHEMA_VERSION,
            "exercise": self._exercise_id,
            "set": self._set_no,
            "status": "complete" if complete else "in_progress",
            "target_reps": set_status.get("target_reps"),
            "completed_reps": set_status.get("completed_reps"),
            "started_t_ms": self._set_started_t_ms,
            "completed_t_ms": float(now_ms) if complete else None,
            "set_duration_ms": round(float(now_ms) - self._set_started_t_ms, 6),
            "active_movement_ms": round(
                sum(float(row["movement_duration_ms"]) for row in self._rep_summaries),
                6,
            ),
            "average_form_score": (
                round(sum(scores) / len(scores), 1) if scores else None
            ),
            "reps": deepcopy(self._rep_summaries),
        }
        _atomic_write_json(self._set_summary_path, document)

    def _restore_set_summary(self) -> None:
        if not self._set_summary_path.is_file():
            return
        document = _read_json_mapping(self._set_summary_path)
        if document.get("schema_version") != SET_SUMMARY_SCHEMA_VERSION:
            raise ValueError("set summary schema version is unsupported")
        started = document.get("started_t_ms")
        if self._movement_type == "time":
            if document.get("movement_type") != "time":
                raise ValueError("timed set summary movement type is invalid")
            if not isinstance(started, (int, float)) or isinstance(started, bool):
                raise ValueError("set summary started_t_ms must be numeric")
            self._set_started_t_ms = float(started)
            frames = self._set_dir / "frames" / "keypoints"
            self._frame_no = len(tuple(frames.glob("frame_*.json"))) if frames.is_dir() else 0
            return
        reps = document.get("reps")
        if not isinstance(started, (int, float)) or isinstance(started, bool):
            raise ValueError("set summary started_t_ms must be numeric")
        if not isinstance(reps, list) or any(not isinstance(row, dict) for row in reps):
            raise ValueError("set summary reps must be a list of mappings")
        self._set_started_t_ms = float(started)
        self._rep_summaries = deepcopy(reps)

    def _write_metadata(self, rep_dir: Path) -> None:
        if self._rep_no is None:
            raise RuntimeError("rep number must be allocated before writing metadata")
        if self._rep_no in self._metadata_written_for:
            return
        document = {
            "schema_version": CAPTURE_SCHEMA_VERSION,
            "exercise": self._exercise_id,
            "set": self._set_no,
            "rep": self._rep_no,
            "missing_value": MISSING_VALUE,
            "landmark_schema": list(ALL_LANDMARKS),
            **deepcopy(self._runtime_metadata),
        }
        _atomic_write_json(rep_dir / "metadata.json", document)
        self._metadata_written_for.add(self._rep_no)

    def _ensure_rep_number(self) -> int:
        if self._rep_no is None:
            self._rep_no = _allocate_rep_number(self._set_dir)
        return self._rep_no

    def _write_attempt_result(self, rep_dir: Path, rule_document: dict) -> None:
        events = rule_document.get("events")
        if not isinstance(events, dict):
            return
        if events.get("attempt_completed") is True:
            last_attempt = deepcopy(rule_document.get("last_attempt"))
            document = {
                "schema_version": CAPTURE_SCHEMA_VERSION,
                "exercise": self._exercise_id,
                "set": self._set_no,
                "rep": self._rep_no,
                "completed_on_frame": self._frame_no,
                "phase_scores": (
                    deepcopy(last_attempt.get("phase_scores"))
                    if isinstance(last_attempt, dict)
                    else None
                ),
                "final_score": (
                    last_attempt.get("score") if isinstance(last_attempt, dict) else None
                ),
                "last_attempt": last_attempt,
                "last_rep": deepcopy(rule_document.get("last_rep")),
                "score_coverage": deepcopy(rule_document.get("score_coverage")),
                "set_status": deepcopy(rule_document.get("set_status")),
            }
            _atomic_write_json(rep_dir / "form_score.json", document)
        elif events.get("attempt_discarded") is True:
            document = {
                "schema_version": CAPTURE_SCHEMA_VERSION,
                "exercise": self._exercise_id,
                "set": self._set_no,
                "rep": self._rep_no,
                "discarded_on_frame": self._frame_no,
                "counters": deepcopy(rule_document.get("counters")),
                "events": deepcopy(events),
            }
            _atomic_write_json(rep_dir / "attempt_summary.json", document)


def _complete_keypoint_schema(keypoints: dict[str, dict[str, float]]) -> dict:
    complete: dict[str, dict[str, float | str]] = {}
    for name in ALL_LANDMARKS:
        source = keypoints.get(name)
        if source is None:
            complete[name] = {
                "x": MISSING_VALUE,
                "y": MISSING_VALUE,
                "z": MISSING_VALUE,
                "v": MISSING_VALUE,
            }
            continue
        complete[name] = {
            "x": source["x"],
            "y": source["y"],
            "z": source.get("z", MISSING_VALUE),
            "v": source["v"],
        }
    return complete


def _configured_phases(runtime_metadata: dict) -> tuple[str, ...]:
    fsm = runtime_metadata.get("fsm")
    phases = fsm.get("phases") if isinstance(fsm, dict) else None
    if (
        not isinstance(phases, list)
        or not phases
        or any(not isinstance(phase, str) or not phase for phase in phases)
        or len(set(phases)) != len(phases)
    ):
        raise ValueError("runtime metadata must contain unique non-empty fsm phases")
    return tuple(phases)


def _configured_movement_phases(
    runtime_metadata: dict,
    timed_phases: tuple[str, ...],
) -> tuple[str, ...]:
    templates = runtime_metadata.get("templates")
    if not isinstance(templates, dict):
        raise ValueError("runtime metadata templates must be a mapping")
    active_rule_ids = runtime_metadata.get("active_rule_ids")
    if (
        not isinstance(active_rule_ids, list)
        or any(not isinstance(rule_id, str) for rule_id in active_rule_ids)
    ):
        raise ValueError("runtime metadata active_rule_ids must be a list of strings")
    evidence: set[str] = set()
    for rule_id in active_rule_ids:
        template = templates.get(rule_id)
        if not isinstance(template, dict):
            raise ValueError("active runtime rules must resolve to template mappings")
        scoring = template.get("scoring")
        if not isinstance(scoring, dict) or scoring.get("role") == "monitor":
            continue
        phases = scoring.get("evidence_phases")
        if not isinstance(phases, list) or any(phase not in timed_phases for phase in phases):
            raise ValueError("runtime metadata scoring phases must reference fsm phases")
        evidence.update(phases)
    if not evidence:
        raise ValueError("runtime metadata must define at least one scoring evidence phase")
    return tuple(phase for phase in timed_phases if phase in evidence)


def _empty_phase_durations(phases: tuple[str, ...]) -> dict[str, float]:
    return {phase: 0.0 for phase in phases}


def _read_json_mapping(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"cannot read JSON mapping: {path}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"JSON document must be a mapping: {path}")
    return value


def _allocate_rep_number(set_dir: Path) -> int:
    """Reserve a fresh rep directory so concurrent sockets cannot overwrite one another."""
    set_dir.mkdir(parents=True, exist_ok=True)
    try:
        entries = tuple(set_dir.iterdir())
    except FileNotFoundError:  # A concurrent external removal is reported by mkdir below.
        entries = ()
    values = [
        int(match.group(1))
        for entry in entries
        if entry.is_dir() and (match := _REP_DIRECTORY.fullmatch(entry.name))
    ]
    candidate = max(values, default=0) + 1
    while True:
        try:
            (set_dir / f"rep_{candidate}").mkdir()
        except FileExistsError:
            candidate += 1
            continue
        return candidate


def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise

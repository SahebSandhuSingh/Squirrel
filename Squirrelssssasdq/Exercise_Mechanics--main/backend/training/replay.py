"""Deterministic replay and parity checks for persisted training captures."""

from __future__ import annotations

import json
import os
import re
import tempfile
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Union

import yaml

from backend.core.frame import TrainingFrame, validate_training_frame
from backend.core.stats import rounded as _rounded
from backend.engine.loader import ExerciseConfiguration
from backend.training.baseline import load_baseline_document
from backend.training.builders import build_training_adapter
from backend.training.debug_capture import CAPTURE_SCHEMA_VERSION
from backend.training.target_contract import RepTarget, TimeTarget

REPLAY_SCHEMA_VERSION = 1

_REP_DIR = re.compile(r"^rep_(\d+)$")
_FRAME_FILE = re.compile(r"^frame_(\d+)\.json$")
_STATUS_FIELDS = (
    "tracking",
    "phase",
    "counters",
    "rom",
    "active_rule_ids",
    "issues",
    "cue",
    "last_attempt",
    "last_rep",
    "score_coverage",
    "events",
)
_TIMED_STATUS_FIELDS = (
    "tracking",
    "phase",
    "movement",
    "rom",
    "active_rule_ids",
    "issues",
    "cue",
    "score",
    "last_lift_score",
    "score_coverage",
    "events",
)


class ReplayError(ValueError):
    """A capture cannot be replayed without guessing about missing structure."""


@dataclass(frozen=True)
class CapturedFrame:
    rep: int
    frame: int
    source: TrainingFrame
    stored_status: dict


@dataclass(frozen=True)
class ReplayCapture:
    set_dir: Path
    exercise: str
    set_no: int
    target_reps: int
    baseline: dict
    baseline_quality: dict | None
    config: ExerciseConfiguration
    frames: tuple[CapturedFrame, ...]


@dataclass(frozen=True)
class TimedReplayCapture:
    set_dir: Path
    exercise: str
    set_no: int
    target_duration_ms: int
    baseline: dict
    baseline_quality: dict | None
    config: ExerciseConfiguration
    frames: tuple[CapturedFrame, ...]


def load_replay_capture(set_dir: Path) -> ReplayCapture | TimedReplayCapture:
    """Load and structurally validate one set capture in chronological order."""
    root = Path(set_dir)
    if not root.is_dir():
        raise ReplayError(f"set directory does not exist: {root}")
    root_metadata = root / "metadata.json"
    if root_metadata.is_file():
        metadata = _read_mapping(root_metadata)
        fsm = metadata.get("fsm")
        if isinstance(fsm, dict) and fsm.get("movement_type") == "time":
            return _load_timed_replay_capture(root, metadata)
    reps = sorted(
        (
            (int(match.group(1)), entry)
            for entry in root.iterdir()
            if entry.is_dir() and (match := _REP_DIR.fullmatch(entry.name))
        ),
        key=lambda item: item[0],
    )
    if not reps:
        raise ReplayError("capture has no rep directories")

    metadata_documents = [_read_mapping(path / "metadata.json") for _, path in reps]
    canonical = _metadata_identity(metadata_documents[0])
    for rep_no, metadata in zip((number for number, _ in reps), metadata_documents):
        if _metadata_identity(metadata) != canonical:
            raise ReplayError(f"rep_{rep_no} runtime metadata differs from the set snapshot")

    exercise = _required_str(canonical.get("exercise"), "metadata.exercise")
    set_no = _required_positive_int(canonical.get("set"), "metadata.set")
    fsm = _restore_fsm_transitions(
        exercise,
        _required_mapping(canonical.get("fsm"), "metadata.fsm"),
    )
    config = ExerciseConfiguration(
        slug=exercise,
        templates=_required_mapping(canonical.get("templates"), "metadata.templates"),
        contexts=_required_mapping(canonical.get("contexts"), "metadata.contexts"),
        scoring=_required_mapping(canonical.get("scoring"), "metadata.scoring"),
        fsm=fsm,
        setup={},
    )

    baseline_files = sorted((root / "baseline_kp_data").glob("*.json"))
    if len(baseline_files) != 1:
        raise ReplayError("capture must contain exactly one baseline JSON document")
    baseline_document = load_baseline_document(baseline_files[0])
    if baseline_document is None:
        raise ReplayError("baseline document is unreadable or invalid")
    baseline, baseline_quality = baseline_document

    frames: list[CapturedFrame] = []
    previous_t_ms: float | None = None
    target_reps: int | None = None
    for rep_no, rep_dir in reps:
        keypoint_files = _numbered_files(rep_dir / "keypoints")
        rule_files = _numbered_files(rep_dir / "rules")
        if [number for number, _ in keypoint_files] != [number for number, _ in rule_files]:
            raise ReplayError(f"rep_{rep_no} keypoint/rule frame numbers do not match")
        if not keypoint_files:
            raise ReplayError(f"rep_{rep_no} contains no paired frames")
        expected = list(range(1, len(keypoint_files) + 1))
        if [number for number, _ in keypoint_files] != expected:
            raise ReplayError(f"rep_{rep_no} frame numbers are not contiguous from 1")

        for (frame_no, keypoint_path), (_, rule_path) in zip(keypoint_files, rule_files):
            keypoint_document = _read_mapping(keypoint_path)
            rule_document = _read_mapping(rule_path)
            _validate_pair_identity(
                keypoint_document,
                rule_document,
                exercise=exercise,
                set_no=set_no,
                rep_no=rep_no,
                frame_no=frame_no,
            )
            payload = {
                "t_ms": keypoint_document.get("t_ms"),
                "keypoints": _restore_keypoints(keypoint_document.get("keypoints")),
            }
            try:
                source = validate_training_frame(payload, previous_t_ms=previous_t_ms)
            except ValueError as exc:
                raise ReplayError(f"rep_{rep_no}/frame_{frame_no}: {exc}") from exc
            previous_t_ms = source.t_ms
            status = deepcopy(rule_document)
            set_status = _required_mapping(status.get("set_status"), "rule.set_status")
            candidate_target = _required_positive_int(
                set_status.get("target_reps"), "rule.set_status.target_reps"
            )
            if target_reps is None:
                target_reps = candidate_target
            elif candidate_target != target_reps:
                raise ReplayError("target_reps changes inside the capture")
            frames.append(CapturedFrame(rep_no, frame_no, source, status))

    if target_reps is None:
        raise ReplayError("capture has no target_reps")
    return ReplayCapture(
        root,
        exercise,
        set_no,
        target_reps,
        baseline,
        baseline_quality,
        config,
        tuple(frames),
    )


ReplayAdapterFactory = Callable[[Union[ReplayCapture, TimedReplayCapture]], object]


def replay_capture(
    capture: ReplayCapture | TimedReplayCapture,
    *,
    adapter_factory: ReplayAdapterFactory | None = None,
) -> dict:
    """Run the real adapter and compare every persisted output with its replay."""
    target = (
        TimeTarget("time", capture.target_duration_ms)
        if isinstance(capture, TimedReplayCapture)
        else RepTarget("reps", capture.target_reps)
    )
    adapter = (
        adapter_factory(capture)
        if adapter_factory is not None
        else build_training_adapter(
            capture.exercise,
            baseline=capture.baseline,
            target=target,
            config=capture.config,
        )
    )
    if not all(callable(getattr(adapter, name, None)) for name in ("process", "debug_snapshot")):
        raise TypeError("replay adapter must implement process and debug_snapshot")
    mismatches: list[dict] = []
    for item in capture.frames:
        actual = adapter.process(item.source)
        debug = adapter.debug_snapshot()
        expected = item.stored_status
        fields = _TIMED_STATUS_FIELDS if isinstance(capture, TimedReplayCapture) else _STATUS_FIELDS
        for field in fields:
            # A field the capture never recorded cannot be checked against it. This is what lets
            # the instrumentation grow without invalidating every capture taken before it existed.
            if field in expected:
                _compare(expected[field], actual.get(field), field, item, mismatches)
        _compare(expected.get("set_status"), actual.get("set"), "set_status", item, mismatches)
        _compare(expected.get("rules"), debug.get("rules"), "rules", item, mismatches)
        if "fsm" in expected:
            _compare(expected["fsm"], debug.get("fsm"), "fsm", item, mismatches)
        if not isinstance(capture, TimedReplayCapture):
            _compare_attempt_artifact(capture, item, actual, mismatches)
    return {
        "ok": not mismatches,
        "checked_frames": len(capture.frames),
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
    }


def summarize_timed_lifts(capture: TimedReplayCapture) -> dict[str, dict]:
    """Summarize timed lift events without manufacturing repetition artifacts."""
    if not isinstance(capture, TimedReplayCapture):
        raise TypeError("capture must be a TimedReplayCapture")
    events: dict[int, dict] = {}
    for item in capture.frames:
        stored = item.stored_status.get("events")
        rows = stored.get("lift_cycles") if isinstance(stored, dict) else None
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                raise ReplayError("stored timed lift event must be a mapping")
            lift_id = row.get("lift_id")
            if not isinstance(lift_id, int) or isinstance(lift_id, bool) or lift_id < 1:
                raise ReplayError("stored timed lift id must be a positive integer")
            if lift_id in events:
                raise ReplayError(f"duplicate stored timed lift id: {lift_id}")
            events[lift_id] = deepcopy(row)
    return {str(lift_id): events[lift_id] for lift_id in sorted(events)}


def _load_timed_replay_capture(root: Path, metadata: dict) -> TimedReplayCapture:
    exercise = _required_str(metadata.get("exercise"), "metadata.exercise")
    set_no = _required_positive_int(metadata.get("set"), "metadata.set")
    fsm = _required_mapping(metadata.get("fsm"), "metadata.fsm")
    if fsm.get("movement_type") != "time":
        raise ReplayError("timed capture metadata must declare movement_type time")
    config = ExerciseConfiguration(
        slug=exercise,
        templates=_required_mapping(metadata.get("templates"), "metadata.templates"),
        contexts=_required_mapping(metadata.get("contexts"), "metadata.contexts"),
        scoring=_required_mapping(metadata.get("scoring"), "metadata.scoring"),
        fsm=fsm,
        setup={},
    )

    baseline_files = sorted((root / "baseline_kp_data").glob("*.json"))
    if len(baseline_files) != 1:
        raise ReplayError("capture must contain exactly one baseline JSON document")
    baseline_document = load_baseline_document(baseline_files[0])
    if baseline_document is None:
        raise ReplayError("baseline document is unreadable or invalid")
    baseline, baseline_quality = baseline_document

    keypoint_files = _numbered_files(root / "frames" / "keypoints")
    rule_files = _numbered_files(root / "frames" / "rules")
    if [number for number, _ in keypoint_files] != [number for number, _ in rule_files]:
        raise ReplayError("timed keypoint/rule frame numbers do not match")
    if not keypoint_files:
        raise ReplayError("timed capture contains no paired frames")
    if [number for number, _ in keypoint_files] != list(range(1, len(keypoint_files) + 1)):
        raise ReplayError("timed frame numbers are not contiguous from 1")

    frames: list[CapturedFrame] = []
    previous_t_ms: float | None = None
    target_duration_ms: int | None = None
    for (frame_no, keypoint_path), (_, rule_path) in zip(keypoint_files, rule_files):
        keypoint_document = _read_mapping(keypoint_path)
        rule_document = _read_mapping(rule_path)
        _validate_timed_pair_identity(
            keypoint_document,
            rule_document,
            exercise=exercise,
            set_no=set_no,
            frame_no=frame_no,
        )
        try:
            source = validate_training_frame(
                {
                    "t_ms": keypoint_document.get("t_ms"),
                    "keypoints": _restore_keypoints(keypoint_document.get("keypoints")),
                },
                previous_t_ms=previous_t_ms,
            )
        except ValueError as exc:
            raise ReplayError(f"frame_{frame_no}: {exc}") from exc
        previous_t_ms = source.t_ms
        status = deepcopy(rule_document)
        set_status = _required_mapping(status.get("set_status"), "rule.set_status")
        if set_status.get("movement_type") != "time":
            raise ReplayError("timed rule set_status must declare movement_type time")
        candidate = _required_positive_int(
            set_status.get("target_duration_ms"),
            "rule.set_status.target_duration_ms",
        )
        if target_duration_ms is None:
            target_duration_ms = candidate
        elif target_duration_ms != candidate:
            raise ReplayError("target_duration_ms changes inside the capture")
        frames.append(CapturedFrame(0, frame_no, source, status))
    if target_duration_ms is None:
        raise ReplayError("capture has no target_duration_ms")
    return TimedReplayCapture(
        root,
        exercise,
        set_no,
        target_duration_ms,
        baseline,
        baseline_quality,
        config,
        tuple(frames),
    )


def summarize_reps(capture: ReplayCapture) -> dict:
    """Per-rep outcome for ANY exercise, read from the persisted artefacts.

    Exercise-agnostic on purpose: a capture's verdict (did this rep count, how deep did it get,
    what did it score) is written by the generic scorer, so reviewing a set never needs a
    per-exercise analyzer. Signal MEASUREMENT does — that stays exercise-local."""
    reps: dict[str, dict] = {}
    for rep in sorted({item.rep for item in capture.frames}):
        rep_dir = capture.set_dir / f"rep_{rep}"
        frames = [item for item in capture.frames if item.rep == rep]
        form_score = _read_optional_mapping(rep_dir / "form_score.json")
        discarded = _read_optional_mapping(rep_dir / "attempt_summary.json")
        attempt = (form_score or {}).get("last_attempt") or {}
        reps[str(rep)] = {
            "frame_count": len(frames),
            "duration_ms": _rounded(frames[-1].source.t_ms - frames[0].source.t_ms),
            # A rep directory holds either a completed attempt or a discarded one, never both.
            "completed": form_score is not None,
            "discarded": discarded is not None,
            "classification": attempt.get("classification"),
            "qualified": attempt.get("qualified"),
            "peak": attempt.get("peak"),
            "score": attempt.get("score"),
            "rom_factor": attempt.get("rom_factor"),
            "quality": attempt.get("quality"),
            # Present only for exercises that record a per-limb breakdown (curl); None elsewhere.
            "arm_peaks": attempt.get("arm_peaks"),
            "score_coverage": (form_score or {}).get("score_coverage"),
        }
    return reps


def load_rep_labels(
    path: Path | None,
    capture: ReplayCapture,
    *,
    categories: frozenset[str],
) -> dict[int, dict]:
    """Read a reviewed rep-label manifest, validating it against THIS capture.

    Labels are human review evidence carried into the report; they are never compared against the
    engine's own verdict here. `categories` is exercise-specific vocabulary supplied by the caller
    (squat reviews knee behaviour, curl reviews range of motion)."""
    if path is None:
        return {}
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReplayError(f"cannot read label manifest: {path}") from exc
    if not isinstance(document, dict) or document.get("schema_version") != 1:
        raise ReplayError("label manifest must declare schema_version 1")
    if document.get("exercise") != capture.exercise or document.get("set") != capture.set_no:
        raise ReplayError("label manifest exercise/set does not match the capture")
    rows = document.get("reps")
    if not isinstance(rows, dict):
        raise ReplayError("label manifest reps must be a mapping")
    captured_reps = {item.rep for item in capture.frames}
    labels: dict[int, dict] = {}
    for raw_rep, row in rows.items():
        try:
            rep = int(raw_rep)
        except (TypeError, ValueError) as exc:
            raise ReplayError(f"invalid label rep: {raw_rep!r}") from exc
        if str(rep) != str(raw_rep) or rep not in captured_reps:
            raise ReplayError(f"label refers to unknown rep: {raw_rep!r}")
        if not isinstance(row, dict):
            raise ReplayError(f"label for rep {rep} must be a mapping")
        if row.get("category") not in categories:
            raise ReplayError(
                f"rep {rep} has unsupported label category; expected one of {sorted(categories)}"
            )
        if row.get("confidence") not in {"confirmed", "attempted"}:
            raise ReplayError(f"rep {rep} has unsupported label confidence")
        labels[rep] = dict(row)
    return labels


def atomic_write_report(path: Path, payload: dict) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _numbered_files(directory: Path) -> list[tuple[int, Path]]:
    if not directory.is_dir():
        raise ReplayError(f"missing capture directory: {directory}")
    result = []
    for path in directory.iterdir():
        if path.is_file() and (match := _FRAME_FILE.fullmatch(path.name)):
            result.append((int(match.group(1)), path))
    return sorted(result, key=lambda item: item[0])


def _read_optional_mapping(path: Path) -> dict | None:
    """Read a capture artefact that legitimately may not exist (a rep is completed OR discarded)."""
    if not path.is_file():
        return None
    return _read_mapping(path)


def _read_mapping(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReplayError(f"cannot read JSON: {path}") from exc
    if not isinstance(value, dict):
        raise ReplayError(f"JSON document must be a mapping: {path}")
    return value


def _metadata_identity(metadata: dict) -> dict:
    return {key: deepcopy(value) for key, value in metadata.items() if key != "rep"}


def _restore_fsm_transitions(exercise: str, fsm: dict) -> dict:
    """Attach an immutable YAML graph to captures written before transitions were persisted."""
    restored = deepcopy(fsm)
    if all(key in restored for key in ("phases", "initial_phase", "transitions")):
        return restored
    if exercise != "squat":
        raise ReplayError(f"legacy FSM transition compatibility is unavailable for {exercise}")
    path = (
        Path(__file__).resolve().parents[1]
        / "workouts"
        / exercise
        / "configs"
        / "fsm_compat_v1.yaml"
    )
    try:
        compatibility = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ReplayError("cannot load legacy FSM transition compatibility") from exc
    if not isinstance(compatibility, dict) or compatibility.get("schema_version") != 1:
        raise ReplayError("legacy FSM transition compatibility is invalid")
    for key in ("phases", "initial_phase", "transitions"):
        if key not in compatibility:
            raise ReplayError(f"legacy FSM transition compatibility is missing {key}")
        restored[key] = deepcopy(compatibility[key])
    return restored


def _restore_keypoints(value: object) -> dict:
    source = _required_mapping(value, "keypoints")
    restored: dict[str, dict] = {}
    for name, landmark in source.items():
        point = _required_mapping(landmark, f"keypoints.{name}")
        if any(point.get(axis) == "nan" for axis in ("x", "y", "v")):
            continue
        restored_point = {axis: point.get(axis) for axis in ("x", "y", "v")}
        if point.get("z") != "nan":
            restored_point["z"] = point.get("z")
        restored[name] = restored_point
    return restored


def _validate_pair_identity(
    keypoints: dict,
    rules: dict,
    *,
    exercise: str,
    set_no: int,
    rep_no: int,
    frame_no: int,
) -> None:
    expected = {
        "exercise": exercise,
        "set": set_no,
        "rep": rep_no,
        "frame": frame_no,
    }
    for field, value in expected.items():
        if keypoints.get(field) != value or rules.get(field) != value:
            raise ReplayError(f"rep_{rep_no}/frame_{frame_no} has inconsistent {field}")
    for field in ("t_ms", "phase"):
        if keypoints.get(field) != rules.get(field):
            raise ReplayError(f"rep_{rep_no}/frame_{frame_no} pair differs on {field}")


def _validate_timed_pair_identity(
    keypoints: dict,
    rules: dict,
    *,
    exercise: str,
    set_no: int,
    frame_no: int,
) -> None:
    expected = {"exercise": exercise, "set": set_no, "frame": frame_no}
    for field, value in expected.items():
        if keypoints.get(field) != value or rules.get(field) != value:
            raise ReplayError(f"frame_{frame_no} has inconsistent {field}")
    for field in ("t_ms", "phase"):
        if keypoints.get(field) != rules.get(field):
            raise ReplayError(f"frame_{frame_no} pair differs on {field}")


def _compare_attempt_artifact(
    capture: ReplayCapture,
    item: CapturedFrame,
    status: dict,
    mismatches: list,
) -> None:
    events = status["events"]
    rep_dir = capture.set_dir / f"rep_{item.rep}"
    if events["attempt_completed"]:
        last_attempt = status["last_attempt"]
        actual = {
            "schema_version": CAPTURE_SCHEMA_VERSION,
            "exercise": capture.exercise,
            "set": capture.set_no,
            "rep": item.rep,
            "completed_on_frame": item.frame,
            "phase_scores": last_attempt.get("phase_scores") if last_attempt else None,
            "final_score": last_attempt.get("score") if last_attempt else None,
            "last_attempt": deepcopy(last_attempt),
            "last_rep": deepcopy(status["last_rep"]),
            "score_coverage": deepcopy(status["score_coverage"]),
            "set_status": deepcopy(status["set"]),
        }
        _compare(
            _without_live_only_fields(_read_mapping(rep_dir / "form_score.json")),
            actual,
            "form_score",
            item,
            mismatches,
        )
    elif events["attempt_discarded"]:
        actual = {
            "schema_version": CAPTURE_SCHEMA_VERSION,
            "exercise": capture.exercise,
            "set": capture.set_no,
            "rep": item.rep,
            "discarded_on_frame": item.frame,
            "counters": deepcopy(status["counters"]),
            "events": deepcopy(events),
        }
        _compare(
            _read_mapping(rep_dir / "attempt_summary.json"),
            actual,
            "attempt_summary",
            item,
            mismatches,
        )


# Per-rep timing is accumulated live, frame-by-frame, by training.debug_capture and is written into
# form_score.json. The deterministic replay reconstructs form_score from scorer/adapter output only,
# so it cannot reproduce these live-only durations; comparing them would be a false mismatch.
_LIVE_ONLY_FORM_SCORE_FIELDS = ("rep_duration_ms", "phase_duration_ms", "movement_duration_ms")


def _without_live_only_fields(form_score: dict) -> dict:
    return {
        key: value
        for key, value in form_score.items()
        if key not in _LIVE_ONLY_FORM_SCORE_FIELDS
    }


def _project(expected: object, actual: object) -> object:
    """Narrow `actual` to the keys `expected` actually recorded, recursively.

    Parity asks "does today's code still reproduce what this capture stored" — so a key the capture
    never held is outside the question. Without this, adding any diagnostic field would turn every
    existing capture into a wall of false mismatches, and the parity baseline would be a reason
    never to improve the instrumentation.

    This tolerates ADDITIONS only. A stored key that is missing, renamed, or whose value changed
    still mismatches, because it is compared directly against `actual.get(key)`. Lists are compared
    whole: an element's shape is part of the recorded value, not an extension point."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        return {key: _project(value, actual.get(key)) for key, value in expected.items()}
    return actual


def _compare(
    expected: object,
    actual: object,
    field: str,
    item: CapturedFrame,
    output: list,
) -> None:
    actual = _project(expected, actual)
    if expected != actual:
        output.append(
            {
                "rep": item.rep,
                "frame": item.frame,
                "t_ms": item.source.t_ms,
                "field": field,
                "expected": deepcopy(expected),
                "actual": deepcopy(actual),
            }
        )


def _required_mapping(value: object, name: str) -> dict:
    if not isinstance(value, dict):
        raise ReplayError(f"{name} must be a mapping")
    return deepcopy(value)


def _required_str(value: object, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ReplayError(f"{name} must be a non-empty string")
    return value


def _required_positive_int(value: object, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise ReplayError(f"{name} must be a positive integer")
    return value

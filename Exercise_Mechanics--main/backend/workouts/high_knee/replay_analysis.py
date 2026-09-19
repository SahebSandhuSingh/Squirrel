"""Deterministic High Knee replay measurements and backend-rig summaries."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

from backend.core.keypoints import missing_keypoints
from backend.core.stats import describe, rounded
from backend.training.replay import (
    ReplayCapture,
    ReplayError,
    TimedReplayCapture,
    summarize_timed_lifts,
)
from backend.workouts.high_knee.adapter import build_high_knee_adapter
from backend.workouts.high_knee.rules.knee_drive_rom import REQUIRED_KEYPOINTS

LIFT_LABEL_CATEGORIES = frozenset({"full", "shallow", "invalid", "nuisance"})


def build_high_knee_replay_adapter(capture: ReplayCapture | TimedReplayCapture):
    """Direct replay-only construction that does not enter production builder registries."""
    if not isinstance(capture, TimedReplayCapture) or capture.exercise != "high_knee":
        raise ReplayError("High Knee replay requires a timed high_knee capture")
    return build_high_knee_adapter(
        baseline=capture.baseline,
        target_duration_ms=capture.target_duration_ms,
        config=capture.config,
    )


def load_lift_labels(
    path: Path | None,
    capture: ReplayCapture | TimedReplayCapture,
) -> dict[int, dict]:
    """Validate reviewed per-lift labels against the events stored in this timed capture."""
    if not isinstance(capture, TimedReplayCapture) or capture.exercise != "high_knee":
        raise ReplayError("High Knee lift labels require a timed high_knee capture")
    if path is None:
        return {}
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReplayError(f"cannot read High Knee label manifest: {path}") from exc
    if not isinstance(document, dict) or document.get("schema_version") != 1:
        raise ReplayError("High Knee label manifest must declare schema_version 1")
    if document.get("exercise") != "high_knee" or document.get("set") != capture.set_no:
        raise ReplayError("High Knee label manifest exercise/set does not match the capture")
    rows = document.get("lifts")
    if not isinstance(rows, dict):
        raise ReplayError("High Knee label manifest lifts must be a mapping")
    captured = summarize_timed_lifts(capture)
    labels: dict[int, dict] = {}
    for raw_lift_id, row in rows.items():
        try:
            lift_id = int(raw_lift_id)
        except (TypeError, ValueError) as exc:
            raise ReplayError(f"invalid High Knee label lift id: {raw_lift_id!r}") from exc
        if str(lift_id) != str(raw_lift_id) or str(lift_id) not in captured:
            raise ReplayError(f"High Knee label refers to unknown lift: {raw_lift_id!r}")
        if not isinstance(row, dict):
            raise ReplayError(f"High Knee label for lift {lift_id} must be a mapping")
        if row.get("category") not in LIFT_LABEL_CATEGORIES:
            raise ReplayError(
                "High Knee lift label category must be one of "
                f"{sorted(LIFT_LABEL_CATEGORIES)}"
            )
        if row.get("confidence") not in {"confirmed", "attempted"}:
            raise ReplayError("High Knee lift label confidence is invalid")
        side = row.get("side")
        if side is not None and side != captured[str(lift_id)].get("side"):
            raise ReplayError(f"High Knee lift {lift_id} label side does not match capture")
        labels[lift_id] = dict(row)
    return labels


def analyze_high_knee_signals(
    capture: ReplayCapture | TimedReplayCapture,
    labels: dict[int, dict] | None = None,
) -> dict:
    """Replay every frame and return the Phase 7 frame stream plus interval summary."""
    if not isinstance(capture, TimedReplayCapture) or capture.exercise != "high_knee":
        raise ReplayError("High Knee analysis requires a timed high_knee capture")
    labels = labels or {}
    adapter = build_high_knee_replay_adapter(capture)
    max_delta = float(capture.config.scoring["max_frame_delta_ms"])
    records: list[dict] = []
    lifts: dict[int, dict] = {}

    for item in capture.frames:
        status = adapter.process(item.source)
        debug = adapter.debug_snapshot()
        frame_events = deepcopy(status["events"]["lift_cycles"])
        for event in frame_events:
            lift_id = int(event["lift_id"])
            lifts[lift_id] = {**deepcopy(event), "label": labels.get(lift_id)}
        records.append(
            {
                "frame": item.frame,
                "t_ms": item.source.t_ms,
                "interval_ms": 0.0,
                "set": {
                    "elapsed_ms": status["set"]["elapsed_ms"],
                    "remaining_ms": status["set"]["remaining_ms"],
                    "complete": status["set"]["complete"],
                },
                "rom": deepcopy(status["rom"]),
                "fsm": {
                    "left_phase": status["movement"]["left_phase"],
                    "right_phase": status["movement"]["right_phase"],
                    "left_current_peak": status["movement"]["left_current_peak"],
                    "right_current_peak": status["movement"]["right_current_peak"],
                    "diagnostics": deepcopy(debug["fsm"]),
                },
                "lift_events": frame_events,
                "verdicts": [event["classification"] for event in frame_events],
                "cadence": {
                    "current_spm": status["movement"]["current_cadence_spm"],
                    "average_spm": status["movement"]["average_cadence_spm"],
                    "peak_spm": status["movement"]["peak_cadence_spm"],
                },
                "alternation": {
                    "breaks": status["movement"]["alternation_breaks"],
                    "last_counted_side": status["movement"]["last_counted_side"],
                },
                "rules": deepcopy(debug["rules"]),
                "keypoint_availability": {
                    "tracking": deepcopy(status["tracking"]),
                    "missing_required": missing_keypoints(
                        item.source.keypoints, REQUIRED_KEYPOINTS
                    ),
                },
                "cue": deepcopy(status["cue"]),
                "score": deepcopy(status["score"]),
                "last_lift_score": deepcopy(status["last_lift_score"]),
                "monitors": deepcopy(status["monitors"]),
                "score_coverage": deepcopy(status["score_coverage"]),
                "movement": deepcopy(status["movement"]),
            }
        )

    for current, following in zip(records, records[1:]):
        current["interval_ms"] = rounded(
            max(
                0.0,
                min(
                    float(following["t_ms"]) - float(current["t_ms"]),
                    max_delta,
                ),
            )
        )

    final = records[-1] if records else None
    movement = {} if final is None else final["movement"]
    score = {} if final is None else final["score"]
    return {
        "classification_applied": True,
        "classification_source": "HighKneeLiftDetector replay",
        "protocol_constants": {
            "max_frame_delta_ms": max_delta,
            "movement_start": capture.config.fsm["movement_start"],
            "reset": capture.config.fsm["reset"],
            "min_lift_peak": capture.config.fsm["min_lift_peak"],
            "full_rom_gate": capture.config.templates["knee_drive_rom"][
                "full_rom_gate"
            ],
        },
        "baseline": {
            "left_gap_px": adapter.runtime_metadata()["signal_reference"][
                "left_baseline_gap_px"
            ],
            "right_gap_px": adapter.runtime_metadata()["signal_reference"][
                "right_baseline_gap_px"
            ],
            "quality": capture.baseline_quality,
        },
        "labels": {str(key): value for key, value in sorted(labels.items())},
        "lifts": {str(key): value for key, value in sorted(lifts.items())},
        "set_summary": {
            "target_duration_ms": capture.target_duration_ms,
            "actual_duration_ms": (
                0.0 if final is None else final["set"]["elapsed_ms"]
            ),
            "attempted_lifts": movement.get("detected_cycles", 0),
            "qualified_lifts": movement.get("counted_lifts", 0),
            "full_lifts": movement.get("full_lifts", 0),
            "shallow_lifts": movement.get("shallow_lifts", 0),
            "invalid_lifts": movement.get("invalid_lifts", 0),
            "left_lifts": movement.get("left_lifts", 0),
            "right_lifts": movement.get("right_lifts", 0),
            "average_cadence_spm": movement.get("average_cadence_spm"),
            "peak_cadence_spm": movement.get("peak_cadence_spm"),
            "alternation_breaks": movement.get("alternation_breaks", 0),
            "rom_peak_distributions": {
                side: describe(
                    [
                        float(event["peak_progress"])
                        for event in lifts.values()
                        if event["side"] == side
                        and event["classification"] in {"shallow", "full_rom"}
                    ]
                )
                for side in ("left", "right")
            },
            "rule_evidence": _rule_evidence(records),
            "tracking_coverage": _tracking_coverage(records),
            "score_coverage": (
                None if final is None else final["score_coverage"]
            ),
            "monitors": None if final is None else final["monitors"],
            "rom_factor": score.get("rom_factor"),
            "form_factor": score.get("form_factor"),
            "final_score": score.get("score"),
            "reliability": score.get("quality", "not_performed"),
        },
        "frames": records,
    }


def _tracking_coverage(records: list[dict]) -> dict:
    total = sum(float(record["interval_ms"]) for record in records)

    def duration(field: str) -> float:
        return sum(
            float(record["interval_ms"])
            for record in records
            if record["keypoint_availability"]["tracking"].get(field) is True
        )

    any_available = duration("available")
    left = duration("left_available")
    right = duration("right_available")
    return {
        "total_ms": rounded(total),
        "any_available_ms": rounded(any_available),
        "left_available_ms": rounded(left),
        "right_available_ms": rounded(right),
        "any_available_ratio": rounded(any_available / total) if total > 0 else None,
        "left_available_ratio": rounded(left / total) if total > 0 else None,
        "right_available_ratio": rounded(right / total) if total > 0 else None,
    }


def _rule_evidence(records: list[dict]) -> dict:
    rule_ids = sorted(
        {
            rule_id
            for record in records
            for rule_id in record["rules"]
        }
    )
    output: dict[str, dict] = {}
    for rule_id in rule_ids:
        active_ms = available_ms = not_ok_ms = 0.0
        active_frames = available_frames = not_ok_frames = 0
        for record in records:
            result = record["rules"].get(rule_id) or {}
            if not result.get("active") or not result.get("phase_active"):
                continue
            active_frames += 1
            interval = float(record["interval_ms"])
            active_ms += interval
            if result.get("available"):
                available_frames += 1
                available_ms += interval
            reading = result.get("result")
            if isinstance(reading, dict) and reading.get("not_ok") is True:
                not_ok_frames += 1
                not_ok_ms += interval
        output[rule_id] = {
            "configured_active": any(
                record["rules"].get(rule_id, {}).get("active") for record in records
            ),
            "active_ms": rounded(active_ms),
            "active_frames": active_frames,
            "available_ms": rounded(available_ms),
            "available_frames": available_frames,
            "unavailable_ms": rounded(max(0.0, active_ms - available_ms)),
            "not_ok_ms": rounded(not_ok_ms),
            "not_ok_frames": not_ok_frames,
        }
    return output

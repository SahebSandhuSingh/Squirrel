"""Offline squat signal measurement over a deterministic replay capture."""

from __future__ import annotations

import json
import math
from pathlib import Path

from backend.core.keypoints import reference_xy, usable_xy
from backend.core.stats import describe, rounded as _rounded
from backend.training.replay import ReplayCapture, ReplayError, load_rep_labels as _load_rep_labels
from backend.workouts.squat.rules.knee_valgus import KneeValgusSignal
from backend.workouts.squat.rules.lateral_torso_lean import (
    SIGNAL_MODE as TORSO_LEAN_SIGNAL_MODE,
    LateralTorsoLeanSignal,
)

# Browser pose coordinates are integer pixels at the protocol boundary. One pixel is therefore
# the lifetime quantization/degenerate-geometry floor, not an exercise detection threshold.
PIXEL_QUANTIZATION_FLOOR = 1.0
_MOVEMENT_PHASES = ("descent", "bottom", "ascent")
_MOVEMENT_PHASE_SET = frozenset(_MOVEMENT_PHASES)
_SIGNALS = (
    "left_inward_delta",
    "right_inward_delta",
    "bilateral_span_collapse",
    "lateral_torso_lean_deg",
)


# Squat review vocabulary: what a human was asked to judge about each rep.
REP_LABEL_CATEGORIES = frozenset({"clean", "knee_in"})


def load_rep_labels(path: Path | None, capture: ReplayCapture) -> dict[int, dict]:
    """Reviewed squat rep labels, validated against this capture."""
    return _load_rep_labels(path, capture, categories=REP_LABEL_CATEGORIES)


def analyze_squat_signals(capture: ReplayCapture, labels: dict[int, dict]) -> dict:
    """Return measurements only; this function deliberately performs no classification."""
    knee = KneeValgusSignal(capture.baseline)
    torso_lean = LateralTorsoLeanSignal(
        capture.baseline,
        TORSO_LEAN_SIGNAL_MODE,
    )
    baseline_span_ratio = _knee_ankle_ratio(capture.baseline, reference=True)
    if baseline_span_ratio is None:
        raise ReplayError("baseline cannot produce a knee-to-ankle span ratio")

    max_delta = float(capture.config.scoring["max_frame_delta_ms"])
    records: list[dict] = []
    for item in capture.frames:
        phase = item.stored_status["phase"]
        movement_phase = phase in _MOVEMENT_PHASE_SET
        knee_reading = knee.read(item.source.keypoints) if movement_phase else None
        torso_lean_reading = (
            torso_lean.read(item.source.keypoints) if movement_phase else None
        )
        records.append(
            {
                "rep": item.rep,
                "frame": item.frame,
                "t_ms": item.source.t_ms,
                "phase": phase,
                "movement_phase": movement_phase,
                "interval_ms": 0.0,
                "left_inward_delta": _rounded(
                    None if knee_reading is None else knee_reading.left_inward_delta
                ),
                "right_inward_delta": _rounded(
                    None if knee_reading is None else knee_reading.right_inward_delta
                ),
                "bilateral_span_collapse": _rounded(
                    None
                    if knee_reading is None
                    else knee_reading.bilateral_span_collapse
                ),
                "lateral_torso_lean_deg": _rounded(
                    None
                    if torso_lean_reading is None
                    else torso_lean_reading.lean_angle_deg
                ),
            }
        )
    for current, following in zip(records, records[1:]):
        current["interval_ms"] = _rounded(
            max(0.0, min(float(following["t_ms"]) - float(current["t_ms"]), max_delta))
        )

    per_rep: dict[str, dict] = {}
    for rep in sorted({record["rep"] for record in records}):
        rep_records = [record for record in records if record["rep"] == rep]
        movement = [record for record in rep_records if record["movement_phase"]]
        phases = {
            phase: _summaries([record for record in rep_records if record["phase"] == phase])
            for phase in sorted({record["phase"] for record in rep_records})
        }
        per_rep[str(rep)] = {
            "label": labels.get(rep),
            "frame_count": len(rep_records),
            "movement_frame_count": len(movement),
            "movement": _summaries(movement),
            "phases": phases,
            "stored_form_score": _load_form_score(capture.set_dir / f"rep_{rep}"),
        }

    return {
        "measurement_only": True,
        "classification_applied": False,
        "protocol_constants": {
            "pixel_quantization_floor": PIXEL_QUANTIZATION_FLOOR,
            "max_frame_delta_ms": max_delta,
        },
        "baseline": {
            "knee_to_ankle_span_ratio": _rounded(baseline_span_ratio),
            "quality": capture.baseline_quality,
        },
        "labels": {str(rep): label for rep, label in sorted(labels.items())},
        "per_rep": per_rep,
        "frames": records,
    }


def _summaries(records: list[dict]) -> dict:
    return {signal: _summary(records, signal) for signal in _SIGNALS}


def _summary(records: list[dict], signal: str) -> dict:
    available = [record for record in records if record[signal] is not None]
    values = [float(record[signal]) for record in available]
    if not values:
        return {
            "available_frames": 0,
            "unavailable_frames": len(records),
            "positive_frames": 0,
            "positive_ms": 0.0,
            "statistics": None,
        }
    return {
        "available_frames": len(available),
        "unavailable_frames": len(records) - len(available),
        "positive_frames": sum(value > 0 for value in values),
        "positive_ms": _rounded(
            sum(float(record["interval_ms"]) for record in available if float(record[signal]) > 0)
        ),
        "statistics": describe(values),
    }


def _knee_ankle_ratio(keypoints: dict, *, reference: bool) -> float | None:
    required = ("left_knee", "right_knee", "left_ankle", "right_ankle")
    points = reference_xy(keypoints, required) if reference else usable_xy(keypoints, required)
    if points is None:
        return None
    ankle_span = _distance(points["left_ankle"], points["right_ankle"])
    if ankle_span < PIXEL_QUANTIZATION_FLOOR:
        return None
    return _distance(points["left_knee"], points["right_knee"]) / ankle_span


def _distance(first: tuple[float, float], second: tuple[float, float]) -> float:
    return math.hypot(second[0] - first[0], second[1] - first[1])


def _load_form_score(rep_dir: Path) -> dict | None:
    path = rep_dir / "form_score.json"
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ReplayError(f"cannot read stored form score: {path}") from exc
    if not isinstance(value, dict):
        raise ReplayError(f"stored form score must be a mapping: {path}")
    return {
        "classification": (value.get("last_attempt") or {}).get("classification"),
        "phase_scores": value.get("phase_scores"),
        "final_score": value.get("final_score"),
        "score_coverage": value.get("score_coverage"),
    }

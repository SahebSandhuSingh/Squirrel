"""Offline bicep curl signal measurement over a deterministic replay capture.

The curl analog of `workouts/squat/replay_analysis.py`: it re-reads every captured frame through the
real `curl_rom` kernel and reports what the ROM signal DID, without judging it. This is the input to
every curl threshold decision — the full-ROM gate was set from exactly these numbers, and the next
person to touch it should reset it the same way rather than from intuition.

What it measures, per frame and per arm:
    • `*_ratio`     — normalized curl progress (0 at the baseline hang, 1 at `target_offset`)
    • `*_offset`    — the raw normalized wrist height the ratio is derived from
    • `progress`    — the weaker arm, i.e. the scalar the RepFSM actually consumed
    • `arm_gap`     — |left − right|, how far apart the two arms were on this frame

`arm_gap` is the one signal with no squat counterpart: a double-arm exercise driven by a single
scalar hides asymmetry, so a capture that looks clean can still contain reps where one arm led the
other by a wide margin. Measuring it is how that gets noticed.

Deliberately performs NO classification — see the module's `measurement_only` flag.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.core.stats import describe, rounded
from backend.training.replay import (
    ReplayCapture,
    ReplayError,
    load_rep_labels as _load_rep_labels,
)
from backend.workouts.bicep_curl.rules.curl_rom import RULE_ID, CurlRomRule
from backend.workouts.bicep_curl.rules.elbow_flare_corridor import (
    RULE_ID as ELBOW_FLARE_RULE_ID,
    ElbowFlareSignal,
)
from backend.workouts.bicep_curl.rules.lateral_torso_lean import (
    RULE_ID as LATERAL_TORSO_LEAN_RULE_ID,
    LateralTorsoLeanSignal,
)
from backend.workouts.bicep_curl.rules.shoulder_elevation import (
    RULE_ID as SHOULDER_ELEVATION_RULE_ID,
    ShoulderElevationSignal,
)

# Curl review vocabulary: what a human was asked to judge about each rep. `invalid` covers an
# attempt that never cleared `min_rep_peak` and was discarded rather than counted.
REP_LABEL_CATEGORIES = frozenset({"full", "shallow", "invalid"})

_SIGNALS = (
    "progress",
    "left_ratio",
    "right_ratio",
    "left_offset",
    "right_offset",
    "arm_gap",
    "left_shoulder_elevation",
    "right_shoulder_elevation",
    "max_shoulder_elevation",
    # The two ingredients of the correction, kept separate so a new capture can be re-fitted without
    # re-deriving the geometry: `shoulder_raw_rise` is the uncorrected rise, `shoulder_curl_offset`
    # is (curl_height - baseline_curl_height), the term the slope multiplies.
    "shoulder_raw_rise",
    "shoulder_curl_offset",
    "left_elbow_flare",
    "right_elbow_flare",
    "max_elbow_flare",
    "lateral_torso_lean_deg",
)
# The engine fixes only these two lifecycle phases; every other phase in the capture's own graph is
# movement. Derived rather than listed, so curl's ascent/top/descent are never hardcoded here.
_LIFECYCLE_PHASES = frozenset({"setup", "reset"})


def load_rep_labels(path: Path | None, capture: ReplayCapture) -> dict[int, dict]:
    """Reviewed curl rep labels, validated against this capture."""
    return _load_rep_labels(path, capture, categories=REP_LABEL_CATEGORIES)


def analyze_bicep_curl_signals(capture: ReplayCapture, labels: dict[int, dict]) -> dict:
    """Return measurements only; this function deliberately performs no classification."""
    try:
        template = capture.config.templates[RULE_ID]
    except KeyError as exc:
        raise ReplayError(
            f"capture has no '{RULE_ID}' template; it predates the wrist-height ROM signal and "
            "cannot be analyzed with the current kernel"
        ) from exc
    try:
        rule = CurlRomRule(
            capture.baseline,
            template["target_offset"],
            template["full_rom_gate"],
            min_upper_arm_px=template["min_upper_arm_px"],
        )
    except (KeyError, ValueError) as exc:
        raise ReplayError(f"cannot build the curl ROM kernel from this capture: {exc}") from exc

    shoulder_template = capture.config.templates.get(SHOULDER_ELEVATION_RULE_ID)
    shoulder_elevation = None
    if shoulder_template is not None:
        try:
            shoulder_elevation = ShoulderElevationSignal(
                capture.baseline,
                shoulder_template["policy"]["mode"],
                min_shoulder_width_px=shoulder_template["min_shoulder_width_px"],
                min_torso_length_px=shoulder_template["min_torso_length_px"],
                curl_height_slope=shoulder_template["curl_height_slope"],
            )
        except (KeyError, ValueError) as exc:
            raise ReplayError(
                f"cannot build the shoulder-elevation signal from this capture: {exc}"
            ) from exc

    elbow_flare_template = capture.config.templates.get(ELBOW_FLARE_RULE_ID)
    elbow_flare = None
    if elbow_flare_template is not None:
        try:
            elbow_flare = ElbowFlareSignal(
                capture.baseline,
                elbow_flare_template["policy"]["mode"],
                min_shoulder_width_px=elbow_flare_template["min_shoulder_width_px"],
                min_torso_length_px=elbow_flare_template["min_torso_length_px"],
            )
        except (KeyError, ValueError) as exc:
            raise ReplayError(
                f"cannot build the elbow-flare signal from this capture: {exc}"
            ) from exc

    lateral_lean_template = capture.config.templates.get(LATERAL_TORSO_LEAN_RULE_ID)
    lateral_lean = None
    if lateral_lean_template is not None:
        try:
            lateral_lean = LateralTorsoLeanSignal(
                capture.baseline,
                lateral_lean_template["policy"]["mode"],
                min_torso_length_px=lateral_lean_template["min_torso_length_px"],
            )
        except (KeyError, ValueError) as exc:
            raise ReplayError(
                f"cannot build the lateral-torso-lean signal from this capture: {exc}"
            ) from exc

    max_delta = float(capture.config.scoring["max_frame_delta_ms"])
    movement_phases = frozenset(capture.config.fsm["phases"]) - _LIFECYCLE_PHASES

    records: list[dict] = []
    for item in capture.frames:
        phase = item.stored_status["phase"]
        reading = rule.read(item.source.keypoints)
        movement_phase = phase in movement_phases
        shoulder_reading = (
            shoulder_elevation.read(item.source.keypoints)
            if shoulder_elevation is not None and movement_phase
            else None
        )
        elbow_flare_reading = (
            elbow_flare.read(item.source.keypoints)
            if elbow_flare is not None and movement_phase
            else None
        )
        lateral_lean_reading = (
            lateral_lean.read(item.source.keypoints)
            if lateral_lean is not None and movement_phase
            else None
        )
        records.append(
            {
                "rep": item.rep,
                "frame": item.frame,
                "t_ms": item.source.t_ms,
                "phase": phase,
                "movement_phase": movement_phase,
                "interval_ms": 0.0,
                "progress": rounded(None if reading is None else reading.progress),
                "left_ratio": rounded(None if reading is None else reading.left_ratio),
                "right_ratio": rounded(None if reading is None else reading.right_ratio),
                "left_offset": rounded(None if reading is None else reading.left_offset),
                "right_offset": rounded(None if reading is None else reading.right_offset),
                "arm_gap": rounded(
                    None if reading is None else abs(reading.left_ratio - reading.right_ratio)
                ),
                "weaker_side": None if reading is None else reading.weaker_side,
                "left_shoulder_elevation": rounded(
                    None if shoulder_reading is None else shoulder_reading.left_elevation
                ),
                "right_shoulder_elevation": rounded(
                    None if shoulder_reading is None else shoulder_reading.right_elevation
                ),
                "max_shoulder_elevation": rounded(
                    None if shoulder_reading is None else shoulder_reading.max_elevation
                ),
                "shoulder_raw_rise": rounded(
                    None if shoulder_reading is None else shoulder_reading.raw_rise
                ),
                "shoulder_curl_offset": rounded(
                    None
                    if shoulder_reading is None or shoulder_elevation is None
                    else shoulder_reading.curl_height
                    - shoulder_elevation.baseline.own_curl_height
                ),
                "left_elbow_flare": rounded(
                    None
                    if elbow_flare_reading is None
                    else elbow_flare_reading.left_outward_delta
                ),
                "right_elbow_flare": rounded(
                    None
                    if elbow_flare_reading is None
                    else elbow_flare_reading.right_outward_delta
                ),
                "max_elbow_flare": rounded(
                    None
                    if elbow_flare_reading is None
                    else elbow_flare_reading.max_outward_delta
                ),
                "lateral_torso_lean_deg": rounded(
                    None
                    if lateral_lean_reading is None
                    else lateral_lean_reading.lean_angle_deg
                ),
            }
        )
    for current, following in zip(records, records[1:]):
        current["interval_ms"] = rounded(
            max(0.0, min(float(following["t_ms"]) - float(current["t_ms"]), max_delta))
        )

    per_rep: dict[str, dict] = {}
    for rep in sorted({record["rep"] for record in records}):
        rep_records = [record for record in records if record["rep"] == rep]
        movement = [record for record in rep_records if record["movement_phase"]]
        per_rep[str(rep)] = {
            "label": labels.get(rep),
            "frame_count": len(rep_records),
            "movement_frame_count": len(movement),
            "unreadable_frame_count": sum(
                record["progress"] is None for record in rep_records
            ),
            "movement": _summaries(movement),
            "phases": {
                phase: _summaries([record for record in rep_records if record["phase"] == phase])
                for phase in sorted({record["phase"] for record in rep_records})
            },
            # The single number the full/shallow verdict turned on, plus where it happened, so a
            # disputed rep can be inspected frame by frame.
            "peak": _peak(movement, "progress"),
            "weaker_side_at_peak": _weaker_side_at_peak(movement),
            "stored_form_score": _load_form_score(capture.set_dir / f"rep_{rep}"),
        }

    return {
        "measurement_only": True,
        "classification_applied": False,
        "protocol_constants": {
            "max_frame_delta_ms": max_delta,
            "full_rom_gate": template["full_rom_gate"],
            "min_rep_peak": capture.config.fsm["min_rep_peak"],
            "target_offset": template["target_offset"],
            "min_upper_arm_px": template["min_upper_arm_px"],
            "shoulder_elevation": (
                None
                if shoulder_template is None
                else {
                    "mode": shoulder_template["policy"]["mode"],
                    "curl_height_slope": shoulder_template["curl_height_slope"],
                    "min_shoulder_width_px": shoulder_template["min_shoulder_width_px"],
                    "min_torso_length_px": shoulder_template["min_torso_length_px"],
                    "ranges": shoulder_template["policy"]["ranges"],
                }
            ),
            "elbow_flare_corridor": (
                None
                if elbow_flare_template is None
                else {
                    "mode": elbow_flare_template["policy"]["mode"],
                    "min_shoulder_width_px": elbow_flare_template[
                        "min_shoulder_width_px"
                    ],
                    "min_torso_length_px": elbow_flare_template["min_torso_length_px"],
                    "ranges": elbow_flare_template["policy"]["ranges"],
                }
            ),
            "lateral_torso_lean": (
                None
                if lateral_lean_template is None
                else {
                    "mode": lateral_lean_template["policy"]["mode"],
                    "ranges": lateral_lean_template["policy"]["ranges"],
                }
            ),
        },
        "baseline": {
            # The person-specific reference the whole signal is normalized against — the first thing
            # to check when a capture's numbers look wrong.
            "rest_offset": {
                side: rounded(rule.rest_offset(side)) for side in ("left", "right")
            },
            "upper_arm_px": {
                side: rounded(rule.baseline_upper_arm_px(side)) for side in ("left", "right")
            },
            "shoulder_elevation": (
                None
                if shoulder_elevation is None
                else {
                    "height": {
                        "left": rounded(shoulder_elevation.baseline.left_height),
                        "right": rounded(shoulder_elevation.baseline.right_height),
                    },
                    "curl_height": rounded(shoulder_elevation.baseline.own_curl_height),
                    "shoulder_width_px": rounded(
                        shoulder_elevation.baseline.shoulder_width_px
                    ),
                    "torso_length_px": rounded(
                        shoulder_elevation.baseline.torso_length_px
                    ),
                }
            ),
            "elbow_flare_corridor": (
                None
                if elbow_flare is None
                else {
                    "baseline_offset": {
                        side: rounded(elbow_flare.baseline_offset(side))
                        for side in ("left", "right")
                    },
                    "shoulder_width_px": rounded(
                        elbow_flare.baseline_shoulder_width_px
                    ),
                    "torso_length_px": rounded(elbow_flare.baseline_torso_length_px),
                }
            ),
            "lateral_torso_lean": (
                None
                if lateral_lean is None
                else {"baseline_angle_deg": rounded(lateral_lean.baseline_angle_deg)}
            ),
            "quality": capture.baseline_quality,
        },
        "curl_height_slope_fit": _fit_curl_height_slope(records),
        "labels": {str(rep): label for rep, label in sorted(labels.items())},
        "per_rep": per_rep,
        "frames": records,
    }


def _fit_curl_height_slope(records: list[dict]) -> dict | None:
    """Least-squares slope of raw rise against curl offset, forced through the origin.

    This is the constant `shoulder_elevation.curl_height_slope` is set from, re-measured on THIS
    capture. Forced through the origin because the correction is anchored at the person's own
    baseline: at rest the offset is zero and the expected rise must be zero too.

    RUN THIS ON A CLEAN CAPTURE ONLY. The fit cannot tell a tracker artifact from a real shrug, so a
    capture containing deliberate shrugs returns a slope biased high — which would then under-report
    shrugs when fed back into the config. `frame_count` is reported so a thin fit is obvious.
    """
    usable = [
        record
        for record in records
        if record["movement_phase"]
        and record["shoulder_raw_rise"] is not None
        and record["shoulder_curl_offset"] is not None
    ]
    denominator = sum(float(record["shoulder_curl_offset"]) ** 2 for record in usable)
    if len(usable) < 30 or denominator <= 0:
        return None
    numerator = sum(
        float(record["shoulder_curl_offset"]) * float(record["shoulder_raw_rise"])
        for record in usable
    )
    slope = numerator / denominator
    residuals = [
        float(record["shoulder_raw_rise"]) - slope * float(record["shoulder_curl_offset"])
        for record in usable
    ]
    return {
        "slope": rounded(slope),
        "frame_count": len(usable),
        "residual": describe(residuals),
    }


def _summaries(records: list[dict]) -> dict:
    return {signal: _summary(records, signal) for signal in _SIGNALS}


def _summary(records: list[dict], signal: str) -> dict:
    available = [record for record in records if record[signal] is not None]
    values = [float(record[signal]) for record in available]
    return {
        "available_frames": len(available),
        "unavailable_frames": len(records) - len(available),
        "statistics": describe(values),
    }


def _peak(records: list[dict], signal: str) -> dict | None:
    available = [record for record in records if record[signal] is not None]
    if not available:
        return None
    best = max(available, key=lambda record: float(record[signal]))
    return {"value": best[signal], "frame": best["frame"], "t_ms": best["t_ms"]}


def _weaker_side_at_peak(records: list[dict]) -> str | None:
    peak = _peak(records, "progress")
    if peak is None:
        return None
    for record in records:
        if record["frame"] == peak["frame"]:
            return record["weaker_side"]
    return None


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

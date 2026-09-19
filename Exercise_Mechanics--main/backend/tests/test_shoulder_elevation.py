"""Curl-corrected front-view shoulder-elevation rule tests.

The fixture is a front-view torso with independently controllable shoulder rise and wrist height,
which is the whole point: the defect this rule exists to survive is a shoulder that APPEARS to rise
purely because the wrists came up.
"""

from __future__ import annotations

from math import cos, radians, sin

import pytest

from backend.workouts.bicep_curl.rules.shoulder_elevation import (
    SIGNAL_MODE,
    ShoulderElevationRule,
    ShoulderElevationSignal,
    ShoulderElevationVerdict,
)

_SLOPE = 0.040
_RANGES = [
    {"range": {"lte": 0.04}, "state": "safe", "skeleton_color": "green"},
    {"range": {"gt": 0.04, "lte": 0.05}, "state": "warning", "skeleton_color": "green"},
    {"range": {"gt": 0.05}, "state": "not_ok", "skeleton_color": "red"},
]

# Torso 100px tall, shoulders 80px apart: heights below are therefore in units of 80px.
_TORSO = 100.0
_WIDTH = 80.0


def _pose(
    *,
    left_rise: float = 0.0,
    right_rise: float = 0.0,
    wrist_y: float = 0.0,
    width: float = _WIDTH,
    shift: tuple[float, float] = (0.0, 0.0),
    scale: float = 1.0,
    rotation_deg: float = 0.0,
    visibility: float = 0.9,
) -> dict:
    """Hips at the origin, shoulders above them. Wrists default to hip level (arms hanging)."""
    points = {
        "left_hip": (-40.0, 0.0),
        "right_hip": (40.0, 0.0),
        "left_shoulder": (-width / 2, -_TORSO - left_rise),
        "right_shoulder": (width / 2, -_TORSO - right_rise),
        "left_wrist": (-40.0, wrist_y),
        "right_wrist": (40.0, wrist_y),
    }
    angle = radians(rotation_deg)
    c, s = cos(angle), sin(angle)
    return {
        name: {
            "x": (x * c - y * s) * scale + shift[0],
            "y": (x * s + y * c) * scale + shift[1],
            "v": visibility,
        }
        for name, (x, y) in points.items()
    }


def _signal(**kwargs) -> ShoulderElevationSignal:
    return ShoulderElevationSignal(
        _pose(**kwargs),
        SIGNAL_MODE,
        min_shoulder_width_px=30,
        min_torso_length_px=50,
        curl_height_slope=_SLOPE,
    )


def _rule(ranges=None) -> ShoulderElevationRule:
    return ShoulderElevationRule(
        _pose(),
        SIGNAL_MODE,
        _RANGES if ranges is None else ranges,
        min_shoulder_width_px=30,
        min_torso_length_px=50,
        curl_height_slope=_SLOPE,
    )


# --------------------------------------------------------------------------- measurement

def test_the_baseline_pose_reads_zero_elevation():
    reading = _signal().read(_pose())
    assert reading.left_elevation == pytest.approx(0.0, abs=1e-9)
    assert reading.right_elevation == pytest.approx(0.0, abs=1e-9)
    assert reading.expected_rise == pytest.approx(0.0, abs=1e-9)


def test_rise_is_measured_per_side_in_shoulder_widths():
    reading = _signal().read(_pose(left_rise=8.0))
    assert reading.left_elevation == pytest.approx(8.0 / _WIDTH)  # 0.10
    assert reading.right_elevation == pytest.approx(0.0, abs=1e-9)
    assert reading.max_elevation == pytest.approx(0.10)


def test_translation_and_body_roll_are_invariant():
    reference = _signal().read(_pose(left_rise=8, right_rise=4))
    rolled = _signal().read(
        _pose(left_rise=8, right_rise=4, rotation_deg=20, shift=(300, -200))
    )
    assert rolled.left_elevation == pytest.approx(reference.left_elevation)
    assert rolled.right_elevation == pytest.approx(reference.right_elevation)


def test_camera_distance_is_invariant_when_the_baseline_shares_the_scale():
    reference = _signal().read(_pose(left_rise=8))
    scaled = _signal(scale=2).read(_pose(left_rise=8, scale=2))
    assert scaled.left_elevation == pytest.approx(reference.left_elevation)


def test_shoulder_depression_is_not_a_shrug():
    verdict = _rule().read(_pose(left_rise=-8, right_rise=-4))
    assert verdict.left_elevation < 0 and verdict.right_elevation < 0
    assert verdict.state == "safe" and verdict.not_ok is False


# ------------------------------------------------------- the two defects that killed v1 and v2

def test_shoulder_narrowing_alone_is_not_a_shrug():
    """v1's defect, from labelled session 20260720T071533.

    A height-to-width ratio on the LIVE span faulted every clean rep. An ordinary double-arm curl
    protracts the girdle ~8.4% at the top all by itself, while a deliberate shrug adds only ~3% —
    so narrowing measures the curl, not the shrug. Fixing the denominator to the baseline span is
    what makes narrowing contribute exactly zero, and it drops camera rotation out for free.
    """
    reading = _signal().read(_pose(width=_WIDTH * 0.75))  # a 25% narrowing

    assert reading.left_elevation == pytest.approx(0.0, abs=1e-9)
    assert reading.right_elevation == pytest.approx(0.0, abs=1e-9)


def test_a_shoulder_lifted_only_by_the_tracker_is_not_a_shrug():
    """v2's defect, from labelled sessions 20260720T061234 and 20260720T071533.

    As the wrists rise the tracker lifts the shoulder landmark too — smoothly, at visibility 1.00,
    and by as much as a real shrug. Raw rise therefore cannot separate the two. Here the shoulders
    rise by EXACTLY the amount the curl height predicts, which is the artifact and nothing else, and
    the corrected signal must read zero.
    """
    signal = _signal()
    wrists_up = _pose(wrist_y=-_TORSO)  # wrists level with the shoulders
    predicted = signal.read(wrists_up).expected_rise
    assert predicted > 0  # the correction is doing something

    artifact_only = _pose(
        wrist_y=-_TORSO,
        left_rise=predicted * _WIDTH,
        right_rise=predicted * _WIDTH,
    )
    reading = signal.read(artifact_only)

    assert reading.raw_rise == pytest.approx(predicted, abs=1e-9)  # raw rise would have faulted
    assert reading.max_elevation == pytest.approx(0.0, abs=1e-9)


def test_a_real_shrug_at_the_top_of_the_curl_is_still_detected():
    """The correction must not swallow the signal it exists to expose."""
    signal = _signal()
    wrists_up = _pose(wrist_y=-_TORSO)
    predicted = signal.read(wrists_up).expected_rise

    # The tracker's artifact PLUS a genuine 8px lift on top of it.
    shrugged = _pose(
        wrist_y=-_TORSO,
        left_rise=predicted * _WIDTH + 8.0,
        right_rise=predicted * _WIDTH + 8.0,
    )
    verdict = _rule().read(shrugged)

    assert verdict.max_elevation == pytest.approx(8.0 / _WIDTH)  # 0.10, clear of the 0.05 fault
    assert verdict.not_ok is True
    assert verdict.side == "both"


def test_the_correction_is_anchored_at_the_persons_own_baseline():
    """Why one slope can serve every build: longer arms just move the anchor.

    A person whose wrists hang lower has a different baseline curl height. Both must read zero at
    rest and agree once the wrists reach the same body-relative height.
    """
    long_arms = _signal(wrist_y=40.0)  # wrists hang below the hips
    short_arms = _signal(wrist_y=-20.0)

    assert long_arms.read(_pose(wrist_y=40.0)).max_elevation == pytest.approx(0.0, abs=1e-9)
    assert short_arms.read(_pose(wrist_y=-20.0)).max_elevation == pytest.approx(0.0, abs=1e-9)

    # Same shoulders, same wrist height, different baselines -> the correction differs by exactly
    # the difference in anchors, so neither person is judged against the other's arm length.
    reached = _pose(wrist_y=-_TORSO)
    assert long_arms.read(reached).expected_rise > short_arms.read(reached).expected_rise


# --------------------------------------------------------------------------- classification

def test_rule_applies_safe_warning_fault_colors_and_sides():
    rule = _rule()
    safe = rule.read(_pose(left_rise=2.4))       # 0.030
    warning = rule.read(_pose(left_rise=3.6))    # 0.045
    left = rule.read(_pose(left_rise=8.0))       # 0.100
    right = rule.read(_pose(right_rise=8.0))
    both = rule.read(_pose(left_rise=8.0, right_rise=8.0))

    assert safe.state == "safe" and not safe.not_ok and safe.side is None
    assert warning.state == "warning" and warning.skeleton_color == "green"
    assert not warning.not_ok and warning.side is None
    assert left.state == "not_ok" and left.side == "left" and left.skeleton_color == "red"
    assert right.side == "right"
    assert both.side == "both"


# --------------------------------------------------------------------------- unavailability

def test_missing_low_confidence_or_degenerate_geometry_is_unavailable():
    signal = _signal()

    missing_hip = _pose()
    del missing_hip["left_hip"]
    missing_wrist = _pose()
    del missing_wrist["right_wrist"]
    low_confidence = _pose()
    low_confidence["right_shoulder"]["v"] = 0.1
    narrow = _pose(width=10.0)
    short = _pose()
    short["left_shoulder"]["y"] = -10.0
    short["right_shoulder"]["y"] = -10.0

    assert signal.read(missing_hip) is None
    assert signal.read(missing_wrist) is None  # no wrist, no curl height, no correction
    assert signal.read(low_confidence) is None
    assert signal.read(narrow) is None
    assert signal.read(short) is None


def test_bad_baseline_mode_or_ranges_are_rejected():
    no_wrist = _pose()
    del no_wrist["left_wrist"]
    with pytest.raises(ValueError, match="requires both shoulders, hips and wrists"):
        _signal_from(no_wrist, SIGNAL_MODE)
    with pytest.raises(ValueError, match="unsupported shoulder-elevation signal mode"):
        _signal_from(_pose(), "invented")
    with pytest.raises(ValueError, match="last range must have no upper boundary"):
        _rule(_RANGES[:-1])


def _signal_from(baseline: dict, mode: str) -> ShoulderElevationSignal:
    return ShoulderElevationSignal(
        baseline,
        mode,
        min_shoulder_width_px=30,
        min_torso_length_px=50,
        curl_height_slope=_SLOPE,
    )


def test_verdict_is_a_frozen_dataclass():
    verdict = _rule().read(_pose())
    assert isinstance(verdict, ShoulderElevationVerdict)
    with pytest.raises(Exception):
        verdict.state = "not_ok"  # type: ignore[misc]

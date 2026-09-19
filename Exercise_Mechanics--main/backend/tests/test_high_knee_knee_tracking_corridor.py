"""High Knee front-view knee-tracking corridor tests."""

from __future__ import annotations

from copy import deepcopy
from math import cos, radians, sin

import pytest

from backend.workouts.high_knee.rules.knee_tracking_corridor import (
    KneeTrackingCorridorRule,
    KneeTrackingSignal,
)

_RANGES = [
    {"range": {"lte": 0.18}, "state": "safe", "skeleton_color": "green"},
    {
        "range": {"gt": 0.18, "lte": 0.25},
        "state": "warning",
        "skeleton_color": "green",
    },
    {"range": {"gt": 0.25}, "state": "not_ok", "skeleton_color": "red"},
]


def _baseline() -> dict:
    return {
        "left_shoulder": {"x": 250.0, "y": 100.0},
        "right_shoulder": {"x": 150.0, "y": 100.0},
        "left_hip": {"x": 230.0, "y": 250.0},
        "right_hip": {"x": 170.0, "y": 250.0},
        "left_knee": {"x": 230.0, "y": 400.0},
        "right_knee": {"x": 170.0, "y": 400.0},
    }


def _live(*, left_x=230.0, right_x=170.0) -> dict:
    points = deepcopy(_baseline())
    points["left_knee"].update(x=left_x, y=275.0)
    points["right_knee"].update(x=right_x, y=275.0)
    for point in points.values():
        point["v"] = 0.95
    return points


def _rule(baseline=None) -> KneeTrackingCorridorRule:
    return KneeTrackingCorridorRule(
        baseline or _baseline(),
        "baseline_relative_lateral_drift",
        _RANGES,
        min_shoulder_width_px=30,
        min_torso_length_px=50,
    )


def test_vertical_knee_drive_stays_inside_captured_corridor():
    reading = _rule().read(_live())
    assert reading.left_lateral_delta == pytest.approx(0.0)
    assert reading.right_lateral_delta == pytest.approx(0.0)
    assert reading.state == "safe"
    assert reading.not_ok is False
    assert reading.side is None


@pytest.mark.parametrize(
    ("side", "coordinate", "expected_delta"),
    [
        ("left", 256.0, 0.26),
        ("left", 204.0, -0.26),
        ("right", 144.0, 0.26),
        ("right", 196.0, -0.26),
    ],
)
def test_large_inward_or_outward_drift_flags_the_correct_side(
    side, coordinate, expected_delta
):
    points = _live(**{f"{side}_x": coordinate})
    reading = _rule().read(points)
    assert getattr(reading, f"{side}_lateral_delta") == pytest.approx(expected_delta)
    assert getattr(reading, f"{side}_not_ok") is True
    assert reading.state == "not_ok"
    assert reading.skeleton_color == "red"
    assert reading.side == side


def test_boundaries_keep_warning_non_penalizing():
    rule = _rule()
    safe = rule.read(_live(left_x=248.0))
    warning = rule.read(_live(left_x=255.0))
    fault = rule.read(_live(left_x=255.0001))
    assert (safe.left_state, safe.left_not_ok) == ("safe", False)
    assert (warning.left_state, warning.left_not_ok) == ("warning", False)
    assert (fault.left_state, fault.left_not_ok) == ("not_ok", True)


def test_baseline_asymmetry_is_subtracted_instead_of_treated_as_fault():
    baseline = _baseline()
    baseline["left_knee"]["x"] = 245.0
    points = _live(left_x=245.0)
    reading = _rule(baseline).read(points)
    assert reading.left_lateral_delta == pytest.approx(0.0)
    assert reading.left_state == "safe"


def test_translation_and_rigid_camera_roll_do_not_change_signal():
    baseline = _baseline()
    live = _live(left_x=256.0)
    angle = radians(13.0)

    def transform(points):
        result = deepcopy(points)
        for point in result.values():
            x, y = point["x"], point["y"]
            point["x"] = x * cos(angle) - y * sin(angle) + 80.0
            point["y"] = x * sin(angle) + y * cos(angle) - 35.0
        return result

    original = _rule(baseline).read(live)
    transformed = _rule(transform(baseline)).read(transform(live))
    assert transformed.left_lateral_delta == pytest.approx(
        original.left_lateral_delta
    )
    assert transformed.state == original.state


def test_knee_availability_is_independent_per_side():
    points = _live(left_x=256.0)
    del points["right_knee"]
    reading = _rule().read(points)
    assert reading.left_available is True
    assert reading.left_not_ok is True
    assert reading.right_available is False
    assert reading.right_not_ok is None
    assert reading.side == "left"


def test_bad_shared_body_frame_suppresses_both_sides():
    points = _live()
    del points["left_shoulder"]
    reading = _rule().read(points)
    assert reading.left_available is False
    assert reading.right_available is False
    assert reading.state is None
    assert reading.not_ok is False


def test_signal_rejects_wrong_mode_and_degenerate_baseline():
    with pytest.raises(ValueError, match="unsupported knee-tracking signal mode"):
        KneeTrackingSignal(
            _baseline(),
            "wrong",
            min_shoulder_width_px=30,
            min_torso_length_px=50,
        )
    baseline = _baseline()
    baseline["left_shoulder"] = deepcopy(baseline["right_shoulder"])
    with pytest.raises(ValueError, match="implausibly small"):
        KneeTrackingSignal(
            baseline,
            "baseline_relative_lateral_drift",
            min_shoulder_width_px=30,
            min_torso_length_px=50,
        )

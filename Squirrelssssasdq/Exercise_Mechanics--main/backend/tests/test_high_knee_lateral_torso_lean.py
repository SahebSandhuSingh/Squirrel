"""High Knee exercise-owned lateral torso lean tests."""

from __future__ import annotations

from copy import deepcopy
from math import cos, radians, sin, tan

import pytest

from backend.workouts.high_knee.rules.lateral_torso_lean import (
    LateralTorsoLeanRule,
    LateralTorsoLeanSignal,
)

_MODE = "baseline_relative_angle"
_RANGES = [
    {"range": {"lt": -8.0}, "state": "not_ok", "side": "right", "skeleton_color": "red"},
    {"range": {"gte": -8.0, "lt": -5.0}, "state": "warning", "side": "right", "skeleton_color": "green"},
    {"range": {"gte": -5.0, "lte": 5.0}, "state": "safe", "side": None, "skeleton_color": "green"},
    {"range": {"gt": 5.0, "lte": 8.0}, "state": "warning", "side": "left", "skeleton_color": "green"},
    {"range": {"gt": 8.0}, "state": "not_ok", "side": "left", "skeleton_color": "red"},
]


def _pose(lean_deg=0.0) -> dict:
    shoulder_shift = tan(radians(lean_deg)) * 150.0
    return {
        "left_shoulder": {"x": 250.0 + shoulder_shift, "y": 100.0},
        "right_shoulder": {"x": 150.0 + shoulder_shift, "y": 100.0},
        "left_hip": {"x": 230.0, "y": 250.0},
        "right_hip": {"x": 170.0, "y": 250.0},
        "left_ankle": {"x": 230.0, "y": 550.0},
        "right_ankle": {"x": 170.0, "y": 550.0},
    }


def _live(lean_deg=0.0) -> dict:
    points = _pose(lean_deg)
    for point in points.values():
        point["v"] = 0.95
    return points


def _rule(baseline=None):
    return LateralTorsoLeanRule(
        baseline or _pose(),
        _MODE,
        _RANGES,
        min_torso_length_px=50,
    )


@pytest.mark.parametrize(
    ("angle", "state", "side", "not_ok"),
    [
        (-8.01, "not_ok", "right", True),
        (-8.0, "warning", "right", False),
        (-5.0, "safe", None, False),
        (0.0, "safe", None, False),
        (5.0, "safe", None, False),
        (8.0, "warning", "left", False),
        (8.01, "not_ok", "left", True),
    ],
)
def test_configured_boundaries_and_anatomical_side(angle, state, side, not_ok):
    reading = _rule().read(_live(angle))
    assert reading is not None
    assert reading.lean_angle_deg == pytest.approx(angle)
    assert (reading.state, reading.side, reading.not_ok) == (state, side, not_ok)


def test_natural_baseline_angle_is_subtracted():
    baseline = _pose(lean_deg=3.5)
    same = _rule(baseline).read(_live(lean_deg=3.5))
    farther = _rule(baseline).read(_live(lean_deg=12.5))
    assert same is not None and same.lean_angle_deg == pytest.approx(0.0)
    assert farther is not None and farther.lean_angle_deg == pytest.approx(9.0)
    assert farther.not_ok is True and farther.side == "left"


def test_translation_scale_and_camera_roll_do_not_change_lean_delta():
    baseline = _pose()
    live = _live(9.0)
    angle = radians(17.0)

    def transform(points):
        result = deepcopy(points)
        for point in result.values():
            x, y = point["x"] * 1.6, point["y"] * 1.6
            point["x"] = x * cos(angle) - y * sin(angle) + 90.0
            point["y"] = x * sin(angle) + y * cos(angle) - 40.0
        return result

    original = _rule(baseline).read(live)
    transformed = _rule(transform(baseline)).read(transform(live))
    assert original is not None and transformed is not None
    assert transformed.lean_angle_deg == pytest.approx(original.lean_angle_deg)
    assert transformed.state == original.state


def test_live_ankles_are_not_required_for_torso_only_measurement():
    points = _live(9.0)
    del points["left_ankle"]
    del points["right_ankle"]
    reading = _rule().read(points)
    assert reading is not None and reading.not_ok is True


def test_missing_live_torso_or_collapsed_geometry_is_unavailable():
    missing = _live()
    del missing["left_shoulder"]
    assert _rule().read(missing) is None

    collapsed = _live()
    collapsed["left_shoulder"].update(x=230.0, y=250.0)
    collapsed["right_shoulder"].update(x=170.0, y=250.0)
    assert _rule().read(collapsed) is None


def test_bad_baseline_and_policy_fail_closed():
    no_ankles = _pose()
    del no_ankles["left_ankle"]
    with pytest.raises(ValueError, match="requires shoulders, hips and ankles"):
        LateralTorsoLeanSignal(no_ankles, _MODE, min_torso_length_px=50)
    with pytest.raises(ValueError, match="unsupported lateral-torso-lean"):
        LateralTorsoLeanSignal(_pose(), "wrong", min_torso_length_px=50)
    with pytest.raises(ValueError, match="finite and positive"):
        LateralTorsoLeanSignal(_pose(), _MODE, min_torso_length_px=0)

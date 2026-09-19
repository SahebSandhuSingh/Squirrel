"""Direct person-baseline-relative knee-valgus signal and rule tests."""

from __future__ import annotations

import pytest

from backend.workouts.squat.rules.knee_valgus import KneeValgusRule, KneeValgusSignal

_RANGES = [
    {"range": {"lte": 0.0}, "state": "safe", "skeleton_color": "green"},
    {
        "range": {"gt": 0.0, "lte": 0.005},
        "state": "warning",
        "skeleton_color": "green",
    },
    {"range": {"gt": 0.005}, "state": "not_ok", "skeleton_color": "red"},
]

def _pose(
    *,
    left_knee_x: float = 60.0,
    right_knee_x: float = -60.0,
    translate_x: float = 0.0,
    scale: float = 1.0,
    visibility: float = 0.9,
) -> dict:
    points = {
        "left_hip": (60.0, 0.0),
        "right_hip": (-60.0, 0.0),
        "left_knee": (left_knee_x, 100.0),
        "right_knee": (right_knee_x, 100.0),
        "left_ankle": (60.0, 200.0),
        "right_ankle": (-60.0, 200.0),
    }
    return {
        name: {
            "x": x * scale + translate_x,
            "y": y * scale,
            "v": visibility,
        }
        for name, (x, y) in points.items()
    }


def _signal(baseline: dict | None = None, *, scale: float = 1.0) -> KneeValgusSignal:
    return KneeValgusSignal(baseline or _pose(scale=scale))


def _rule() -> KneeValgusRule:
    return KneeValgusRule(_pose(), _RANGES)


def test_aligned_baseline_pose_is_zero_change():
    reading = _signal().read(_pose())
    assert reading is not None
    assert reading.left_inward_delta == pytest.approx(0)
    assert reading.right_inward_delta == pytest.approx(0)
    assert reading.bilateral_span_collapse == pytest.approx(0)


def test_each_knee_reports_positive_inward_and_negative_outward_change():
    inward = _signal().read(_pose(left_knee_x=40, right_knee_x=-40))
    outward = _signal().read(_pose(left_knee_x=80, right_knee_x=-80))
    assert inward.left_inward_delta == pytest.approx(0.10)
    assert inward.right_inward_delta == pytest.approx(0.10)
    assert inward.bilateral_span_collapse == pytest.approx(1 / 3)
    assert outward.left_inward_delta == pytest.approx(-0.10)
    assert outward.right_inward_delta == pytest.approx(-0.10)
    assert outward.bilateral_span_collapse == pytest.approx(-1 / 3)


def test_signal_is_translation_and_uniform_scale_invariant():
    translated = _signal().read(
        _pose(left_knee_x=40, right_knee_x=-40, translate_x=500)
    )
    scaled = _signal(scale=2).read(
        _pose(left_knee_x=40, right_knee_x=-40, scale=2)
    )
    assert translated.left_inward_delta == pytest.approx(0.10)
    assert scaled.left_inward_delta == pytest.approx(0.10)
    assert scaled.right_inward_delta == pytest.approx(0.10)


def test_signal_uses_anatomical_labels_when_image_is_mirrored():
    baseline = _pose(left_knee_x=-60, right_knee_x=60)
    for joint in ("left_hip", "left_ankle"):
        baseline[joint]["x"] = -60
    for joint in ("right_hip", "right_ankle"):
        baseline[joint]["x"] = 60
    live = {name: dict(value) for name, value in baseline.items()}
    live["left_knee"]["x"] = -40
    live["right_knee"]["x"] = 40
    reading = _signal(baseline).read(live)
    assert reading.left_inward_delta == pytest.approx(0.10)
    assert reading.right_inward_delta == pytest.approx(0.10)


def test_rule_is_stateless_with_safe_warning_and_not_ok_ranges():
    rule = _rule()
    assert rule.read(_pose()).state == "safe"
    warning = rule.read(_pose(left_knee_x=59.5))
    assert warning.state == "warning"
    assert warning.skeleton_color == "green"
    assert warning.not_ok is False and warning.side is None
    left = rule.read(_pose(left_knee_x=55))
    assert left.not_ok is True and left.side == "left"
    assert left.state == "not_ok" and left.skeleton_color == "red"
    assert rule.read(_pose()).state == "safe"
    right = rule.read(_pose(right_knee_x=-55))
    assert right.not_ok is True and right.side == "right"
    both = rule.read(_pose(left_knee_x=55, right_knee_x=-55))
    assert both.not_ok is True and both.side == "both"


def test_normalized_warning_boundary_is_inclusive_despite_float_representation():
    rule = _rule()
    live = _pose()
    live["left_knee"]["x"] -= 0.3
    live["right_knee"]["x"] += 0.3

    reading = rule.read(live)

    assert reading.bilateral_span_collapse == pytest.approx(0.005)
    assert reading.state == "warning"
    assert reading.not_ok is False


def test_missing_low_confidence_or_degenerate_live_leg_is_unavailable():
    signal = _signal()
    missing = _pose()
    del missing["left_knee"]
    low = _pose()
    low["right_ankle"]["v"] = 0.2
    collapsed = _pose()
    collapsed["left_ankle"] = dict(collapsed["left_hip"])
    assert signal.read(missing) is None
    assert signal.read(low) is None
    assert signal.read(collapsed) is None


def test_degenerate_baseline_geometry_is_rejected_without_tunable_guards():
    narrow_hips = _pose()
    narrow_hips["left_hip"] = dict(narrow_hips["right_hip"])
    with pytest.raises(ValueError, match="hip width is degenerate"):
        KneeValgusSignal(narrow_hips)
    collapsed_leg = _pose()
    collapsed_leg["left_ankle"] = dict(collapsed_leg["left_hip"])
    with pytest.raises(ValueError, match="left leg is degenerate"):
        KneeValgusSignal(collapsed_leg)

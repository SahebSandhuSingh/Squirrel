"""Baseline-relative front-view lateral torso-lean tests."""

from __future__ import annotations

from math import radians, tan

import pytest

from backend.workouts.squat.rules.lateral_torso_lean import (
    BASELINE_KEYPOINTS,
    REQUIRED_KEYPOINTS,
    SIGNAL_MODE,
    LateralTorsoLeanRule,
    LateralTorsoLeanSignal,
)

_RANGES = [
    {"range": {"lt": -5.0}, "state": "not_ok", "side": "right", "skeleton_color": "red"},
    {
        "range": {"gte": -5.0, "lt": -3.0},
        "state": "warning",
        "side": "right",
        "skeleton_color": "green",
    },
    {
        "range": {"gte": -3.0, "lte": 3.0},
        "state": "safe",
        "side": None,
        "skeleton_color": "green",
    },
    {
        "range": {"gt": 3.0, "lte": 5.0},
        "state": "warning",
        "side": "left",
        "skeleton_color": "green",
    },
    {"range": {"gt": 5.0}, "state": "not_ok", "side": "left", "skeleton_color": "red"},
]


def _pose(
    *,
    lean_deg: float = 0.0,
    baseline_lean_deg: float = 0.0,
    whole_shift: float = 0.0,
    ankle_shift: float = 0.0,
    scale: float = 1.0,
    mirrored: bool = False,
    visibility: float = 0.9,
) -> dict:
    direction = -1.0 if mirrored else 1.0
    total_lean = baseline_lean_deg + lean_deg
    shoulder_shift = direction * tan(radians(total_lean)) * 100.0
    points = {
        "left_shoulder": (direction * 40.0 + shoulder_shift, -100.0),
        "right_shoulder": (direction * -40.0 + shoulder_shift, -100.0),
        "left_hip": (direction * 40.0, 0.0),
        "right_hip": (direction * -40.0, 0.0),
        "left_ankle": (direction * 60.0 + ankle_shift, 200.0),
        "right_ankle": (direction * -60.0 + ankle_shift, 200.0),
    }
    return {
        name: {
            "x": (x + whole_shift) * scale,
            "y": y * scale,
            "v": visibility,
        }
        for name, (x, y) in points.items()
    }


def _signal(*, baseline_lean_deg: float = 0.0, mirrored: bool = False):
    return LateralTorsoLeanSignal(
        _pose(baseline_lean_deg=baseline_lean_deg, mirrored=mirrored),
        SIGNAL_MODE,
    )


def _rule() -> LateralTorsoLeanRule:
    return LateralTorsoLeanRule(_pose(), SIGNAL_MODE, _RANGES)


def test_baseline_alignment_is_zero_and_natural_lean_is_subtracted():
    signal = _signal(baseline_lean_deg=2.0)
    assert signal.read(_pose(baseline_lean_deg=2.0)).lean_angle_deg == pytest.approx(0)
    assert signal.read(_pose(baseline_lean_deg=2.0, lean_deg=6.0)).lean_angle_deg == pytest.approx(6)


def test_signed_angle_uses_anatomical_left_and_right_when_mirrored():
    normal = _signal()
    mirrored = _signal(mirrored=True)
    assert normal.read(_pose(lean_deg=6)).lean_angle_deg == pytest.approx(6)
    assert normal.read(_pose(lean_deg=-6)).lean_angle_deg == pytest.approx(-6)
    assert mirrored.read(_pose(lean_deg=6, mirrored=True)).lean_angle_deg == pytest.approx(6)
    assert mirrored.read(_pose(lean_deg=-6, mirrored=True)).lean_angle_deg == pytest.approx(-6)


def test_signal_ignores_translation_scale_and_live_ankle_drift():
    reference = _signal().read(_pose(lean_deg=6)).lean_angle_deg
    translated = _signal().read(
        _pose(lean_deg=6, whole_shift=500, ankle_shift=-20)
    ).lean_angle_deg
    scaled = LateralTorsoLeanSignal(_pose(scale=2), SIGNAL_MODE).read(
        _pose(lean_deg=6, scale=2)
    ).lean_angle_deg
    assert reference == pytest.approx(6)
    assert translated == pytest.approx(reference)
    assert scaled == pytest.approx(reference)


def test_rule_applies_safe_warning_not_ok_ranges_colors_and_sides():
    rule = _rule()
    safe = rule.read(_pose(lean_deg=3))
    warning = rule.read(_pose(lean_deg=-4))
    left = rule.read(_pose(lean_deg=6))
    right = rule.read(_pose(lean_deg=-6))
    assert safe.state == "safe" and safe.side is None and not safe.not_ok
    assert warning.state == "warning" and warning.side == "right"
    assert warning.skeleton_color == "green" and not warning.not_ok
    assert left.state == "not_ok" and left.side == "left" and left.skeleton_color == "red"
    assert right.state == "not_ok" and right.side == "right"


def test_missing_low_confidence_or_degenerate_live_torso_is_unavailable():
    signal = _signal()
    missing = _pose()
    del missing["left_shoulder"]
    low = _pose()
    low["right_hip"]["v"] = 0.2
    zero = _pose()
    zero["left_shoulder"] = dict(zero["left_hip"])
    zero["right_shoulder"] = dict(zero["right_hip"])
    assert signal.read(missing) is None
    assert signal.read(low) is None
    assert signal.read(zero) is None


def test_degenerate_baseline_invalid_mode_and_malformed_ranges_are_rejected():
    stance = _pose()
    stance["left_ankle"] = dict(stance["right_ankle"])
    torso = _pose()
    torso["left_shoulder"] = dict(torso["left_hip"])
    torso["right_shoulder"] = dict(torso["right_hip"])
    with pytest.raises(ValueError, match="stance width is degenerate"):
        LateralTorsoLeanSignal(stance, SIGNAL_MODE)
    with pytest.raises(ValueError, match="torso length is degenerate"):
        LateralTorsoLeanSignal(torso, SIGNAL_MODE)
    with pytest.raises(ValueError, match="unsupported lateral-torso-lean signal mode"):
        LateralTorsoLeanSignal(_pose(), "invented")
    with pytest.raises(ValueError, match="last range must have no upper boundary"):
        LateralTorsoLeanRule(_pose(), SIGNAL_MODE, _RANGES[:-1])


# ── ankles are a BASELINE requirement, not a live one ──────────────────────────

def test_ankles_are_required_at_baseline_but_never_live():
    """Ankles orient anatomical left once, at construction. The live measurement is the trunk
    vector's direction — shoulders and hips only.

    Declaring them live took the rule offline whenever the feet left frame while measuring nothing
    extra. That matters for the target setting, where users frame themselves on whatever surface the
    laptop is on and often crop the feet.

    NOTE the scope: `knee_valgus` and `stance_width` genuinely DO need ankles on every live frame, so
    a cropped-feet frame still disables those two. This only stops torso-lean coaching going dark
    alongside them.
    """
    assert "left_ankle" not in REQUIRED_KEYPOINTS
    assert "right_ankle" not in REQUIRED_KEYPOINTS
    assert set(BASELINE_KEYPOINTS) == set(REQUIRED_KEYPOINTS) | {"left_ankle", "right_ankle"}

    signal = _signal()

    feet_cropped = _pose(lean_deg=4.0)
    del feet_cropped["left_ankle"]
    del feet_cropped["right_ankle"]
    reading = signal.read(feet_cropped)
    assert reading is not None
    assert reading.lean_angle_deg == pytest.approx(4.0)

    # Same again when the ankles are present but below the confidence floor, which is how a
    # partially-cropped frame usually presents rather than as an outright missing landmark.
    feet_low_confidence = _pose(lean_deg=4.0)
    for side in ("left", "right"):
        feet_low_confidence[f"{side}_ankle"]["v"] = 0.1
    low = signal.read(feet_low_confidence)
    assert low is not None
    assert low.lean_angle_deg == pytest.approx(4.0)


def test_a_baseline_without_ankles_is_still_refused():
    """The other half: with no ankles at construction there is no anatomical-left reference."""
    no_ankles = _pose()
    del no_ankles["left_ankle"]
    with pytest.raises(ValueError, match="baseline requires all configured keypoints"):
        LateralTorsoLeanSignal(no_ankles, SIGNAL_MODE)

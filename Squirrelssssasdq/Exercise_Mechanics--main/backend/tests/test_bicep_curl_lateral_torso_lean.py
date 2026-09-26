"""Exercise-local bicep-curl lateral torso-lean tests."""

from __future__ import annotations

from math import radians, tan

import pytest

from backend.workouts.bicep_curl.rules.lateral_torso_lean import (
    BASELINE_KEYPOINTS,
    REQUIRED_KEYPOINTS,
    SIGNAL_MODE,
    LateralTorsoLeanReading,
    LateralTorsoLeanRule,
    LateralTorsoLeanSignal,
)

_MIN_TORSO_PX = 50.0

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
        min_torso_length_px=_MIN_TORSO_PX,
    )


def _rule() -> LateralTorsoLeanRule:
    return LateralTorsoLeanRule(
        _pose(), SIGNAL_MODE, _RANGES, min_torso_length_px=_MIN_TORSO_PX
    )


def test_baseline_alignment_is_zero_and_natural_lean_is_subtracted():
    signal = _signal(baseline_lean_deg=2.0)

    assert signal.baseline_angle_deg == pytest.approx(2.0)
    assert signal.read(_pose(baseline_lean_deg=2.0)).lean_angle_deg == pytest.approx(0)
    assert signal.read(
        _pose(baseline_lean_deg=2.0, lean_deg=6.0)
    ).lean_angle_deg == pytest.approx(6)


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
    scaled = LateralTorsoLeanSignal(
        _pose(scale=2), SIGNAL_MODE, min_torso_length_px=_MIN_TORSO_PX
    ).read(
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
        LateralTorsoLeanSignal(stance, SIGNAL_MODE, min_torso_length_px=_MIN_TORSO_PX)
    with pytest.raises(ValueError, match="torso length is degenerate"):
        LateralTorsoLeanSignal(torso, SIGNAL_MODE, min_torso_length_px=_MIN_TORSO_PX)
    with pytest.raises(ValueError, match="unsupported lateral-torso-lean signal mode"):
        LateralTorsoLeanSignal(_pose(), "invented", min_torso_length_px=_MIN_TORSO_PX)
    with pytest.raises(ValueError, match="last range must have no upper boundary"):
        LateralTorsoLeanRule(
            _pose(), SIGNAL_MODE, _RANGES[:-1], min_torso_length_px=_MIN_TORSO_PX
        )


def test_reading_is_frozen():
    reading = _rule().read(_pose())
    assert isinstance(reading, LateralTorsoLeanReading)
    with pytest.raises(Exception):
        reading.state = "not_ok"  # type: ignore[misc]


def test_a_torso_too_short_to_measure_is_unavailable_not_a_lean():
    """The angle is the hip-to-shoulder line's DIRECTION, so its noise scales inversely with that
    line's length: 1px of landmark jitter is worth 0.34 deg across a healthy 170px torso but 26 deg
    across a 2px one. Degraded tracking still returns confident landmarks, so without a floor a
    collapsed skeleton publishes a fault-sized lean built entirely from noise.

    The squat original guards this with `== 0`, which real float data essentially never satisfies.
    """
    signal = _signal()
    collapsed = _pose()
    for side in ("left", "right"):
        # Shoulders 2px above the hips, and nudged 1px sideways - noise, not a lean.
        collapsed[f"{side}_shoulder"]["y"] = collapsed[f"{side}_hip"]["y"] - 2.0
        collapsed[f"{side}_shoulder"]["x"] = collapsed[f"{side}_hip"]["x"] + 1.0

    # What the unguarded version would have reported from that single pixel:
    assert abs(_signal_without_floor().read(collapsed).lean_angle_deg) > 20.0
    # What this rule reports instead.
    assert signal.read(collapsed) is None


def test_a_healthy_torso_is_unaffected_by_the_floor():
    assert _signal().read(_pose(lean_deg=4.0)).lean_angle_deg == pytest.approx(4.0)


def _signal_without_floor() -> LateralTorsoLeanSignal:
    """The pre-fix behaviour, kept only to make the regression concrete."""
    return LateralTorsoLeanSignal(_pose(), SIGNAL_MODE, min_torso_length_px=0.0)


def test_a_degenerate_baseline_torso_is_refused_at_construction():
    """The baseline angle is one term of `live - baseline`, so an error in it cannot cancel and
    biases every rep of the set. Measured with the floor disabled: a 2px baseline torso turns a
    true 6 deg LEFT lean into a reported 20 deg RIGHT lean — wrong size and wrong side, for the
    whole set, with nothing downstream able to notice.

    Construction raises rather than abstaining: a capture can be redone, a scored set cannot.
    Nothing upstream catches this either — the baseline capture gates measure stability, and a
    collapsed pose held still has near-zero stddev.
    """
    collapsed = _pose()
    for side in ("left", "right"):
        collapsed[f"{side}_shoulder"]["y"] = collapsed[f"{side}_hip"]["y"] - 2.0
        collapsed[f"{side}_shoulder"]["x"] = collapsed[f"{side}_hip"]["x"] + 1.0

    # What the unguarded version does with it: a real +6 deg lean reported as a large NEGATIVE one.
    unguarded = LateralTorsoLeanSignal(collapsed, SIGNAL_MODE, min_torso_length_px=0.0)
    reported = unguarded.read(_pose(lean_deg=6.0)).lean_angle_deg
    assert reported < -20.0

    with pytest.raises(ValueError, match="baseline torso length is degenerate"):
        LateralTorsoLeanSignal(collapsed, SIGNAL_MODE, min_torso_length_px=_MIN_TORSO_PX)


def test_a_noisy_baseline_stance_is_accepted_because_the_axis_cancels():
    """The counterpart NOT guarded, and why.

    The ankle axis only sets the frame both angles are measured in, so a tilted axis shifts the
    baseline and live angles equally and subtracts out. A 2px stance tilts the axis 26.6 deg and
    still reports a true 6 deg lean as exactly 6 deg. Guarding it would reject usable captures to
    protect against nothing.
    """
    narrow = _pose()
    narrow["left_ankle"]["x"] = narrow["right_ankle"]["x"] + 2.0
    narrow["left_ankle"]["y"] = narrow["right_ankle"]["y"] + 1.0

    signal = LateralTorsoLeanSignal(narrow, SIGNAL_MODE, min_torso_length_px=_MIN_TORSO_PX)
    live = _pose(lean_deg=6.0)
    live["left_ankle"] = dict(narrow["left_ankle"])
    live["right_ankle"] = dict(narrow["right_ankle"])

    assert signal.read(live).lean_angle_deg == pytest.approx(6.0, abs=1e-6)


def test_ankles_are_required_at_baseline_but_never_live():
    """Ankles orient anatomical left once, at construction. The live measurement is the trunk
    vector's direction, which needs shoulders and hips alone.

    Requiring them live would take the rule offline whenever the feet leave frame — a real risk for
    a standing upper-body exercise people often frame from the waist up — while measuring nothing
    extra. The stance pre-check runs before the baseline capture and needs ankles, so they are
    guaranteed present exactly where this rule uses them.
    """
    assert "left_ankle" not in REQUIRED_KEYPOINTS
    assert "right_ankle" not in REQUIRED_KEYPOINTS
    assert set(BASELINE_KEYPOINTS) == set(REQUIRED_KEYPOINTS) | {"left_ankle", "right_ankle"}

    signal = _signal()
    feet_out_of_frame = _pose(lean_deg=4.0)
    del feet_out_of_frame["left_ankle"]
    del feet_out_of_frame["right_ankle"]

    reading = signal.read(feet_out_of_frame)
    assert reading is not None
    assert reading.lean_angle_deg == pytest.approx(4.0)


def test_a_baseline_without_ankles_is_still_refused():
    """The other half: without ankles at construction there is no anatomical-left reference."""
    no_ankles = _pose()
    del no_ankles["left_ankle"]
    with pytest.raises(ValueError, match="baseline requires all configured keypoints"):
        LateralTorsoLeanSignal(no_ankles, SIGNAL_MODE, min_torso_length_px=_MIN_TORSO_PX)

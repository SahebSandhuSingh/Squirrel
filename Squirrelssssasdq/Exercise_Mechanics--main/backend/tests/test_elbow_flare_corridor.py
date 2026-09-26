"""Baseline-relative front-view elbow-flare corridor rule tests."""

from __future__ import annotations

from math import cos, radians, sin

import pytest

from backend.workouts.bicep_curl.rules.elbow_flare_corridor import (
    SIGNAL_MODE,
    ElbowFlareReading,
    ElbowFlareRule,
    ElbowFlareSignal,
)

_RANGES = [
    {"range": {"lte": 0.08}, "state": "safe", "skeleton_color": "green"},
    {
        "range": {"gt": 0.08, "lte": 0.12},
        "state": "warning",
        "skeleton_color": "green",
    },
    {"range": {"gt": 0.12}, "state": "not_ok", "skeleton_color": "red"},
]


def _pose(
    *,
    left_flare: float = 0.0,
    right_flare: float = 0.0,
    shift: tuple[float, float] = (0.0, 0.0),
    scale: float = 1.0,
    rotation_deg: float = 0.0,
    visibility: float = 0.9,
) -> dict:
    points = {
        "left_hip": (30.0, 0.0),
        "right_hip": (-30.0, 0.0),
        "left_shoulder": (40.0, -100.0),
        "right_shoulder": (-40.0, -100.0),
        "left_elbow": (50.0 + left_flare, 0.0),
        "right_elbow": (-50.0 - right_flare, 0.0),
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


def _signal() -> ElbowFlareSignal:
    return ElbowFlareSignal(
        _pose(),
        SIGNAL_MODE,
        min_shoulder_width_px=30,
        min_torso_length_px=50,
    )


def _rule() -> ElbowFlareRule:
    return ElbowFlareRule(
        _pose(),
        SIGNAL_MODE,
        _RANGES,
        min_shoulder_width_px=30,
        min_torso_length_px=50,
    )


def test_baseline_is_zero_and_bilateral_flare_is_measured_per_side():
    signal = _signal()
    rest = signal.read(_pose())
    flare = signal.read(_pose(left_flare=16, right_flare=8))

    assert rest.left_outward_delta == pytest.approx(0)
    assert rest.right_outward_delta == pytest.approx(0)
    assert flare.left_outward_delta == pytest.approx(0.2)
    assert flare.right_outward_delta == pytest.approx(0.1)
    assert flare.max_outward_delta == pytest.approx(0.2)


def test_translation_and_rigid_torso_rotation_are_invariant():
    reference = _signal().read(_pose(left_flare=16, right_flare=8))
    transformed = _signal().read(
        _pose(
            left_flare=16,
            right_flare=8,
            rotation_deg=20,
            shift=(300, -200),
        )
    )

    assert transformed.left_outward_delta == pytest.approx(reference.left_outward_delta)
    assert transformed.right_outward_delta == pytest.approx(reference.right_outward_delta)


def test_uniform_scale_is_invariant_when_baseline_is_captured_at_that_scale():
    reference = _signal().read(_pose(left_flare=16, right_flare=8))
    signal = ElbowFlareSignal(
        _pose(scale=2, rotation_deg=20, shift=(300, -200)),
        SIGNAL_MODE,
        min_shoulder_width_px=30,
        min_torso_length_px=50,
    )
    transformed = signal.read(
        _pose(
            left_flare=16,
            right_flare=8,
            scale=2,
            rotation_deg=20,
            shift=(300, -200),
        )
    )

    assert transformed.left_outward_delta == pytest.approx(reference.left_outward_delta)
    assert transformed.right_outward_delta == pytest.approx(reference.right_outward_delta)


def test_live_shoulder_narrowing_does_not_create_a_flare_fault():
    live = _pose()
    live["left_shoulder"]["x"] = 30.0
    live["right_shoulder"]["x"] = -30.0

    reading = _signal().read(live)

    assert reading.left_outward_delta == pytest.approx(0)
    assert reading.right_outward_delta == pytest.approx(0)


def test_rule_applies_safe_warning_fault_colors_and_sides():
    rule = _rule()
    safe = rule.read(_pose(left_flare=6.4))
    warning = rule.read(_pose(left_flare=8.0))
    left = rule.read(_pose(left_flare=16.0))
    right = rule.read(_pose(right_flare=16.0))
    both = rule.read(_pose(left_flare=16.0, right_flare=16.0))

    assert safe.state == "safe" and not safe.not_ok and safe.side is None
    assert warning.state == "warning" and warning.skeleton_color == "green"
    assert not warning.not_ok and warning.side is None
    assert left.state == "not_ok" and left.side == "left"
    assert left.skeleton_color == "red"
    assert right.side == "right"
    assert both.side == "both"


def test_elbow_moving_inward_is_safe_not_flare():
    reading = _rule().read(_pose(left_flare=-16, right_flare=-8))

    assert reading.left_outward_delta < 0
    assert reading.right_outward_delta < 0
    assert reading.state == "safe" and not reading.not_ok


def test_missing_low_confidence_or_degenerate_live_geometry_is_unavailable():
    signal = _signal()
    missing = _pose()
    del missing["left_elbow"]
    low = _pose()
    low["right_elbow"]["v"] = 0.1
    narrow = _pose()
    narrow["left_shoulder"]["x"] = 5
    narrow["right_shoulder"]["x"] = -5
    short = _pose()
    short["left_shoulder"]["y"] = -10
    short["right_shoulder"]["y"] = -10

    assert signal.read(missing) is None
    assert signal.read(low) is None
    assert signal.read(narrow) is None
    assert signal.read(short) is None


def test_bad_baseline_mode_or_ranges_are_rejected():
    missing = _pose()
    del missing["right_hip"]
    with pytest.raises(ValueError, match="requires both shoulders, elbows and hips"):
        ElbowFlareSignal(
            missing,
            SIGNAL_MODE,
            min_shoulder_width_px=30,
            min_torso_length_px=50,
        )
    with pytest.raises(ValueError, match="unsupported elbow-flare signal mode"):
        ElbowFlareSignal(
            _pose(),
            "invented",
            min_shoulder_width_px=30,
            min_torso_length_px=50,
        )
    with pytest.raises(ValueError, match="last range must have no upper boundary"):
        ElbowFlareRule(
            _pose(),
            SIGNAL_MODE,
            _RANGES[:-1],
            min_shoulder_width_px=30,
            min_torso_length_px=50,
        )


def test_baseline_references_and_reading_are_stable_public_diagnostics():
    signal = _signal()
    assert signal.baseline_offset("left") == pytest.approx(0.625)
    assert signal.baseline_offset("right") == pytest.approx(0.625)
    assert signal.baseline_shoulder_width_px == pytest.approx(80.0)
    assert signal.baseline_torso_length_px == pytest.approx(100.0)
    with pytest.raises(ValueError, match="side must be"):
        signal.baseline_offset("both")

    reading = _rule().read(_pose())
    assert isinstance(reading, ElbowFlareReading)
    with pytest.raises(Exception):
        reading.state = "not_ok"  # type: ignore[misc]

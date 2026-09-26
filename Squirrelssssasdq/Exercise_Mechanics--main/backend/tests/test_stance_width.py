"""Shared stance signal and setup/live classified-range policy tests."""

from __future__ import annotations

import pytest

from backend.workouts.squat.rules.stance_width import (
    StanceReading,
    StanceWidthRule,
    StanceWidthSignal,
)

_MIN_SHOULDER = 10.0
_RANGES = [
    {"range": {"lt": 0.70}, "state": "not_ok", "skeleton_color": "red"},
    {"range": {"gte": 0.70, "lt": 0.80}, "state": "warning", "skeleton_color": "green"},
    {"range": {"gte": 0.80, "lte": 1.20}, "state": "safe", "skeleton_color": "green"},
    {"range": {"gt": 1.20, "lte": 1.30}, "state": "warning", "skeleton_color": "green"},
    {"range": {"gt": 1.30}, "state": "not_ok", "skeleton_color": "red"},
]


def _rule() -> StanceWidthRule:
    return StanceWidthRule(_RANGES, min_shoulder_px=_MIN_SHOULDER)


def _kps(ankle_w: float, shoulder_w: float = 100.0, v: float = 0.9) -> dict:
    return {
        "left_shoulder": {"x": 200.0 + shoulder_w / 2, "y": 100.0, "v": v},
        "right_shoulder": {"x": 200.0 - shoulder_w / 2, "y": 100.0, "v": v},
        "left_ankle": {"x": 200.0 + ankle_w / 2, "y": 500.0, "v": v},
        "right_ankle": {"x": 200.0 - ankle_w / 2, "y": 500.0, "v": v},
    }


def test_shared_signal_is_feet_over_shoulders_and_scale_invariant():
    signal = StanceWidthSignal(min_shoulder_px=_MIN_SHOULDER)
    near = signal.read(_kps(130, 100))
    far = signal.read(_kps(260, 200))
    assert near is not None and far is not None
    assert near.ratio == pytest.approx(1.30)
    assert far.ratio == pytest.approx(near.ratio)


@pytest.mark.parametrize(
    ("ratio", "state", "color", "side", "not_ok"),
    (
        (0.69, "not_ok", "red", "narrow", True),
        (0.70, "warning", "green", "narrow", False),
        (0.79, "warning", "green", "narrow", False),
        (0.80, "safe", "green", None, False),
        (1.20, "safe", "green", None, False),
        (1.21, "warning", "green", "wide", False),
        (1.30, "warning", "green", "wide", False),
        (1.31, "not_ok", "red", "wide", True),
    ),
)
def test_configured_ranges_classify_every_boundary(
    ratio: float,
    state: str,
    color: str,
    side: str | None,
    not_ok: bool,
):
    reading = _rule().read(_kps(ratio * 100))
    assert reading is not None
    assert reading.state == state
    assert reading.skeleton_color == color
    assert reading.side == side
    assert reading.not_ok is not_ok


def test_shared_policy_has_no_setup_live_memory():
    rule = _rule()
    assert rule.read(_kps(60)).state == "not_ok"
    assert rule.read(_kps(75)).state == "warning"
    assert rule.read(_kps(100)).state == "safe"


def test_reference_and_live_reads_use_the_same_policy():
    rule = _rule()
    live = rule.read(_kps(75))
    reference = rule.read_reference(_kps(75))
    assert live == reference


def test_missing_low_confidence_and_degenerate_signal_are_unavailable():
    signal = StanceWidthSignal(min_shoulder_px=_MIN_SHOULDER)
    missing = _kps(100)
    del missing["left_shoulder"]
    low = _kps(100)
    low["right_ankle"]["v"] = 0.3
    assert signal.read(missing) is None
    assert signal.read(low) is None
    assert signal.read(_kps(100, shoulder_w=0)) is None
    assert signal.read(_kps(100, shoulder_w=5)) is None


def test_invalid_range_or_signal_configuration_is_rejected():
    invalid = [
        {"range": {"lt": 0.80}, "state": "not_ok", "skeleton_color": "red"},
        {"range": {"gt": 0.80}, "state": "safe", "skeleton_color": "green"},
    ]
    with pytest.raises(ValueError, match="leave a gap"):
        StanceWidthRule(invalid, min_shoulder_px=_MIN_SHOULDER)
    with pytest.raises(ValueError):
        StanceWidthSignal(min_shoulder_px=0)


def test_reading_is_immutable():
    reading = _rule().read(_kps(100))
    assert isinstance(reading, StanceReading)
    with pytest.raises(Exception):
        reading.state = "not_ok"

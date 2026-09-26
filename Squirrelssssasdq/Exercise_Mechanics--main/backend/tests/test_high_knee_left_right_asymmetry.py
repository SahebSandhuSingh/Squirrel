"""High Knee set-level left/right travel monitor tests."""

from __future__ import annotations

import pytest

from backend.training.timed_contract import LiftCycleEvent
from backend.workouts.high_knee.rules.left_right_asymmetry import (
    LeftRightAsymmetryRule,
)


def _event(lift_id: int, side: str, peak: float, classification: str = "full_rom"):
    return LiftCycleEvent(lift_id, side, classification, peak, lift_id * 100.0, lift_id * 100.0 + 50.0)


def test_waits_for_three_qualified_lifts_on_each_side():
    rule = LeftRightAsymmetryRule(min_lifts_per_side=3, max_travel_gap=0.15)
    for event in (
        _event(1, "left", 0.95),
        _event(2, "right", 0.90),
        _event(3, "left", 1.00),
        _event(4, "right", 0.92),
        _event(5, "left", 0.97),
    ):
        rule.record(event)

    reading = rule.read()
    assert reading.status == "insufficient"
    assert reading.has_asymmetry is None
    assert reading.left_samples == 3
    assert reading.right_samples == 2
    assert reading.feedback is None


def test_median_travel_detects_the_lower_side_without_one_lift_outlier():
    rule = LeftRightAsymmetryRule(min_lifts_per_side=3, max_travel_gap=0.15)
    for event in (
        _event(1, "left", 0.95),
        _event(2, "right", 0.60),
        _event(3, "left", 0.96),
        _event(4, "right", 0.62),
        _event(5, "left", 0.20),  # one low outlier does not replace the left median
        _event(6, "right", 0.61),
    ):
        rule.record(event)

    reading = rule.read()
    assert reading.status == "asymmetric"
    assert reading.has_asymmetry is True
    assert reading.left_median_travel == pytest.approx(0.95)
    assert reading.right_median_travel == pytest.approx(0.61)
    assert reading.travel_gap == pytest.approx(0.34)
    assert reading.lower_side == "right"
    assert reading.feedback == "Right knee travelled lower. Match your knee-drive height."


def test_invalid_cycles_are_excluded_and_balanced_result_is_informational():
    rule = LeftRightAsymmetryRule(min_lifts_per_side=3, max_travel_gap=0.15)
    rule.record(_event(1, "left", 0.10, "invalid"))
    for event in (
        _event(2, "left", 0.90),
        _event(3, "right", 0.80),
        _event(4, "left", 0.92),
        _event(5, "right", 0.82),
        _event(6, "left", 0.91),
        _event(7, "right", 0.81),
    ):
        rule.record(event)

    reading = rule.read()
    assert reading.status == "balanced"
    assert reading.has_asymmetry is False
    assert reading.left_samples == reading.right_samples == 3
    assert reading.travel_gap == pytest.approx(0.10)
    assert reading.lower_side is None
    assert reading.feedback == "Left and right knee travel were balanced."

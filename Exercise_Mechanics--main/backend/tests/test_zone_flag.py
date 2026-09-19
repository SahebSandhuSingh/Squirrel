"""Boundary and state tests for the configuration-driven Schmitt flag."""

from __future__ import annotations

import pytest

from backend.engine.zone_flag import ZoneFlag


def test_below_zone_uses_strict_entry_and_inclusive_exit():
    flag = ZoneFlag("below", enter_threshold=0.65, exit_threshold=0.80)
    assert flag.update(0.65).active is False
    assert flag.update(0.64).active is True
    assert flag.update(0.70).active is True
    assert flag.update(0.80).active is False


def test_above_zone_uses_strict_entry_and_inclusive_exit():
    flag = ZoneFlag("above", enter_threshold=1.35, exit_threshold=1.20)
    assert flag.update(1.35).active is False
    assert flag.update(1.36).active is True
    assert flag.update(1.30).active is True
    assert flag.update(1.20).active is False


def test_changed_only_marks_state_transition():
    flag = ZoneFlag("below", enter_threshold=10, exit_threshold=20)
    assert flag.update(5).changed is True
    assert flag.update(6).changed is False
    assert flag.update(20).changed is True


def test_unavailable_value_preserves_state_without_a_reading():
    flag = ZoneFlag("above", enter_threshold=10, exit_threshold=8)
    flag.update(11)
    assert flag.update(None) is None
    assert flag.active is True
    assert flag.update(9).active is True


def test_reset_clears_state():
    flag = ZoneFlag("below", enter_threshold=10, exit_threshold=20)
    flag.update(5)
    flag.reset()
    assert flag.active is False


@pytest.mark.parametrize(
    ("direction", "enter", "exit_"),
    (("below", 2, 1), ("below", 1, 1), ("above", 1, 2), ("above", 1, 1)),
)
def test_invalid_threshold_order_is_rejected(direction: str, enter: float, exit_: float):
    with pytest.raises(ValueError):
        ZoneFlag(direction, enter_threshold=enter, exit_threshold=exit_)


def test_invalid_direction_or_value_is_rejected():
    with pytest.raises(ValueError):
        ZoneFlag("sideways", enter_threshold=1, exit_threshold=2)
    flag = ZoneFlag("below", enter_threshold=1, exit_threshold=2)
    with pytest.raises(ValueError):
        flag.update(float("nan"))

"""Generic one-dimensional Schmitt flag with configuration-supplied thresholds."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from numbers import Real
from typing import Literal

Direction = Literal["below", "above"]


@dataclass(frozen=True)
class ZoneState:
    """One valid signal update and the resulting persistent flag state."""

    value: float
    active: bool
    changed: bool


class ZoneFlag:
    """Stateful Schmitt flag for either a lower or upper fault zone.

    No thresholds are defined in code. For ``below``, the flag enters when the signal is strictly
    below ``enter_threshold`` and clears at or above ``exit_threshold``. For ``above``, the
    comparisons are mirrored. An unavailable value returns ``None`` and preserves the prior state.
    """

    def __init__(
        self,
        direction: Direction,
        *,
        enter_threshold: float,
        exit_threshold: float,
    ) -> None:
        if direction not in {"below", "above"}:
            raise ValueError("zone direction must be 'below' or 'above'")
        enter = self._finite_number(enter_threshold, "enter_threshold")
        exit_ = self._finite_number(exit_threshold, "exit_threshold")
        if direction == "below" and not enter < exit_:
            raise ValueError("below-zone thresholds must satisfy enter_threshold < exit_threshold")
        if direction == "above" and not enter > exit_:
            raise ValueError("above-zone thresholds must satisfy enter_threshold > exit_threshold")
        self._direction = direction
        self._enter = enter
        self._exit = exit_
        self._active = False

    @property
    def active(self) -> bool:
        return self._active

    def update(self, value: float | None) -> ZoneState | None:
        """Update the flag; missing data pauses state and produces no reading."""
        if value is None:
            return None
        signal = self._finite_number(value, "zone value")
        previous = self._active
        if self._direction == "below":
            if self._active:
                self._active = signal < self._exit
            else:
                self._active = signal < self._enter
        else:
            if self._active:
                self._active = signal > self._exit
            else:
                self._active = signal > self._enter
        return ZoneState(signal, self._active, self._active != previous)

    def reset(self) -> None:
        """Clear persistent state at an explicit lifecycle boundary."""
        self._active = False

    @staticmethod
    def _finite_number(value: object, name: str) -> float:
        if not isinstance(value, Real) or isinstance(value, bool):
            raise ValueError(f"{name} must be numeric")
        result = float(value)
        if not isfinite(result):
            raise ValueError(f"{name} must be finite")
        return result

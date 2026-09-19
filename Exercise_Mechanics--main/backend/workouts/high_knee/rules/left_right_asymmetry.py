"""Set-level left/right knee-drive travel monitor for High Knees.

The ROM rule and lift FSM already produce one baseline-normalized peak for every completed lift.
This monitor consumes those qualified events instead of measuring the pose a second time. Invalid
cycles are deliberately excluded, and a median plus a minimum per-side sample count keeps one
unusual lift from becoming an asymmetry verdict.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from statistics import median

from backend.training.timed_contract import LiftCycleEvent

RULE_ID = "left_right_asymmetry"
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
)
_SIDES = ("left", "right")


@dataclass(frozen=True)
class LeftRightAsymmetryReading:
    """Current comparison of qualified left/right peak-travel distributions."""

    status: str  # insufficient | balanced | asymmetric
    has_asymmetry: bool | None
    left_samples: int
    right_samples: int
    left_median_travel: float | None
    right_median_travel: float | None
    travel_gap: float | None
    max_travel_gap: float
    lower_side: str | None
    feedback: str | None


class LeftRightAsymmetryRule:
    """Compare robust per-side travel only after enough completed lifts exist."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(self, *, min_lifts_per_side: int, max_travel_gap: float) -> None:
        if (
            not isinstance(min_lifts_per_side, int)
            or isinstance(min_lifts_per_side, bool)
            or min_lifts_per_side < 1
        ):
            raise ValueError("minimum asymmetry lifts per side must be a positive integer")
        if not isfinite(max_travel_gap) or not 0.0 < max_travel_gap <= 1.0:
            raise ValueError("maximum asymmetry travel gap must lie within (0, 1]")
        self._min_lifts_per_side = min_lifts_per_side
        self._max_travel_gap = float(max_travel_gap)
        self._peaks: dict[str, list[float]] = {side: [] for side in _SIDES}

    def record(self, event: LiftCycleEvent) -> None:
        """Record a qualified lift peak; invalid cycles carry no comparable travel evidence."""
        if not isinstance(event, LiftCycleEvent):
            raise TypeError("asymmetry evidence must be a LiftCycleEvent")
        if not event.counted:
            return
        if event.side not in self._peaks:
            raise ValueError("asymmetry lift side must be 'left' or 'right'")
        if not isfinite(event.peak_progress) or event.peak_progress < 0.0:
            raise ValueError("asymmetry lift peak must be finite and non-negative")
        self._peaks[event.side].append(float(event.peak_progress))

    def read(self, _keypoints: dict | None = None) -> LeftRightAsymmetryReading:
        """Return an immutable set-so-far result; raw keypoints are intentionally unused."""
        counts = {side: len(self._peaks[side]) for side in _SIDES}
        medians = {
            side: median(self._peaks[side]) if self._peaks[side] else None
            for side in _SIDES
        }
        if any(counts[side] < self._min_lifts_per_side for side in _SIDES):
            return LeftRightAsymmetryReading(
                "insufficient",
                None,
                counts["left"],
                counts["right"],
                medians["left"],
                medians["right"],
                None,
                self._max_travel_gap,
                None,
                None,
            )

        left = float(medians["left"])
        right = float(medians["right"])
        gap = abs(left - right)
        asymmetric = gap > self._max_travel_gap
        lower_side = "left" if left < right else "right" if right < left else None
        if asymmetric and lower_side is not None:
            feedback = f"{lower_side.title()} knee travelled lower. Match your knee-drive height."
        else:
            feedback = "Left and right knee travel were balanced."
        return LeftRightAsymmetryReading(
            "asymmetric" if asymmetric else "balanced",
            asymmetric,
            counts["left"],
            counts["right"],
            left,
            right,
            gap,
            self._max_travel_gap,
            lower_side if asymmetric else None,
            feedback,
        )

    def reset(self) -> None:
        for values in self._peaks.values():
            values.clear()

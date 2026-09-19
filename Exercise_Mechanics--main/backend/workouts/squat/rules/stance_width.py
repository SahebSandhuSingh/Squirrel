"""Squat stance-width signal with one shared setup/live range policy."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from numbers import Real

from backend.core.keypoints import reference_xy, usable_xy
from backend.engine.range_policy import NumericRangePolicy

# Anatomical inputs are a property of this signal and remain stable across tuning revisions.
RULE_ID = "stance_width"
REQUIRED_KEYPOINTS = ("left_ankle", "right_ankle", "left_shoulder", "right_shoulder")


@dataclass(frozen=True)
class StanceMeasurement:
    """The shared, policy-free ankle-width / shoulder-width signal."""

    ratio: float


@dataclass(frozen=True)
class StanceReading:
    """One configured stance classification shared by setup and live training."""

    ratio: float
    state: str                   # safe | warning | not_ok
    skeleton_color: str          # configuration-owned presentation state
    not_ok: bool
    side: str | None             # narrow | wide | None


class StanceWidthSignal:
    """Measure stance ratio without applying setup or live thresholds."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(self, *, min_shoulder_px: float) -> None:
        self._min_shoulder_px = _positive_finite(min_shoulder_px, "min_shoulder_px")

    def read(self, keypoints: dict) -> StanceMeasurement | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        return None if points is None else self._measure(points)

    def read_reference(self, keypoints: dict) -> StanceMeasurement | None:
        points = reference_xy(keypoints, REQUIRED_KEYPOINTS)
        return None if points is None else self._measure(points)

    def _measure(self, points: dict[str, tuple[float, float]]) -> StanceMeasurement | None:
        shoulder_width = abs(points["left_shoulder"][0] - points["right_shoulder"][0])
        if shoulder_width < self._min_shoulder_px:
            return None
        ankle_width = abs(points["left_ankle"][0] - points["right_ankle"][0])
        return StanceMeasurement(ankle_width / shoulder_width)


class StancePolicy:
    """Classify the ratio using the exhaustive range table from the template."""

    def __init__(self, ranges: object) -> None:
        self._policy = NumericRangePolicy(ranges)
        safe = tuple(entry for entry in self._policy.ranges if entry.state == "safe")
        if len(safe) != 1 or safe[0].lower is None or safe[0].upper is None:
            raise ValueError("stance policy must define exactly one bounded safe range")
        self._safe_minimum = safe[0].lower
        self._safe_maximum = safe[0].upper

    def evaluate(self, measurement: StanceMeasurement) -> StanceReading:
        ratio = measurement.ratio
        matched = self._policy.classify(ratio)
        side = (
            "narrow" if ratio < self._safe_minimum
            else "wide" if ratio > self._safe_maximum
            else None
        )
        return StanceReading(
            ratio=ratio,
            state=matched.state,
            skeleton_color=matched.skeleton_color,
            not_ok=matched.state == "not_ok",
            side=side,
        )


class StanceWidthRule:
    """Shared setup/live wrapper around the normalized signal and range policy."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        ranges: object,
        *,
        min_shoulder_px: float,
    ) -> None:
        self._signal = StanceWidthSignal(min_shoulder_px=min_shoulder_px)
        self._policy = StancePolicy(ranges)

    def read(self, keypoints: dict) -> StanceReading | None:
        measurement = self._signal.read(keypoints)
        return None if measurement is None else self._policy.evaluate(measurement)

    def read_reference(self, keypoints: dict) -> StanceReading | None:
        measurement = self._signal.read_reference(keypoints)
        return None if measurement is None else self._policy.evaluate(measurement)


def _positive_finite(value: object, name: str) -> float:
    if not isinstance(value, Real) or isinstance(value, bool):
        raise ValueError(f"{name} must be numeric")
    result = float(value)
    if not isfinite(result) or result <= 0:
        raise ValueError(f"{name} must be finite and positive")
    return result

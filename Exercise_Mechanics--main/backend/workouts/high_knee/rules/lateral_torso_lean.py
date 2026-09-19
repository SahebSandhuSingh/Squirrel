"""Baseline-relative front-view lateral torso lean for High Knees."""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, degrees, hypot, isfinite

from backend.core.keypoints import reference_xy, usable_xy
from backend.engine.range_policy import NumericRangePolicy

RULE_ID = "lateral_torso_lean"
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
)
BASELINE_KEYPOINTS = REQUIRED_KEYPOINTS + ("left_ankle", "right_ankle")
SIGNAL_MODE = "baseline_relative_angle"
NORMALIZED_SIGNAL_DECIMALS = 6


@dataclass(frozen=True)
class LateralTorsoLeanSignalReading:
    """Signed change from baseline torso angle; positive is anatomical left."""

    lean_angle_deg: float


@dataclass(frozen=True)
class LateralTorsoLeanReading:
    lean_angle_deg: float
    state: str
    skeleton_color: str
    not_ok: bool
    side: str | None


class LateralTorsoLeanSignal:
    """Measure shoulder-centre displacement over the hip centre in the frontal plane.

    Baseline ankles orient anatomical left once. Live frames need only shoulders and hips, so a
    lifted or cropped foot cannot take this torso-only rule offline. Subtracting the captured torso
    angle preserves the user's natural standing alignment and camera roll.

    High Knees naturally shifts the torso over the stance leg. That expected movement is handled by
    this exercise's wider configuration-owned corridor, not by adding a movement-specific model.
    """

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        baseline: dict,
        mode: str,
        *,
        min_torso_length_px: float,
    ) -> None:
        if mode != SIGNAL_MODE:
            raise ValueError(f"unsupported lateral-torso-lean signal mode: {mode!r}")
        if not isfinite(min_torso_length_px) or min_torso_length_px <= 0.0:
            raise ValueError("minimum torso length must be finite and positive")
        self._min_torso_length_px = float(min_torso_length_px)
        points = reference_xy(baseline, BASELINE_KEYPOINTS)
        if points is None:
            raise ValueError(
                "lateral-torso-lean baseline requires shoulders, hips and ankles"
            )
        left_axis, stance_width = _unit_vector(
            points["right_ankle"], points["left_ankle"]
        )
        if stance_width == 0.0:
            raise ValueError("lateral-torso-lean baseline stance width is degenerate")
        baseline_trunk = _trunk_vector(points)
        if hypot(*baseline_trunk) < self._min_torso_length_px:
            raise ValueError("lateral-torso-lean baseline torso length is degenerate")
        up_axis = (-left_axis[1], left_axis[0])
        if _dot(baseline_trunk, up_axis) < 0.0:
            up_axis = (-up_axis[0], -up_axis[1])
        self._left_axis = left_axis
        self._up_axis = up_axis
        self._baseline_angle = self._angle(baseline_trunk)

    def read(self, keypoints: dict) -> LateralTorsoLeanSignalReading | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        if points is None:
            return None
        trunk = _trunk_vector(points)
        if hypot(*trunk) < self._min_torso_length_px:
            return None
        lean_angle = _wrapped_difference(self._angle(trunk), self._baseline_angle)
        return LateralTorsoLeanSignalReading(lean_angle)

    @property
    def baseline_angle_deg(self) -> float:
        return self._baseline_angle

    def _angle(self, trunk: tuple[float, float]) -> float:
        return degrees(
            atan2(_dot(trunk, self._left_axis), _dot(trunk, self._up_axis))
        )


class LateralTorsoLeanRule:
    """Classify baseline-relative torso angle with the High Knee YAML policy."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        baseline: dict,
        mode: str,
        ranges: object,
        *,
        min_torso_length_px: float,
    ) -> None:
        self._signal = LateralTorsoLeanSignal(
            baseline,
            mode,
            min_torso_length_px=min_torso_length_px,
        )
        self._policy = NumericRangePolicy(ranges)

    def read(self, keypoints: dict) -> LateralTorsoLeanReading | None:
        signal = self._signal.read(keypoints)
        if signal is None:
            return None
        matched = self._policy.classify(
            round(signal.lean_angle_deg, NORMALIZED_SIGNAL_DECIMALS)
        )
        return LateralTorsoLeanReading(
            signal.lean_angle_deg,
            matched.state,
            matched.skeleton_color,
            matched.state == "not_ok",
            matched.side,
        )

    def reset(self) -> None:
        """Stateless rule compatibility hook."""

    @property
    def baseline_angle_deg(self) -> float:
        return self._signal.baseline_angle_deg


def _trunk_vector(points: dict[str, tuple[float, float]]) -> tuple[float, float]:
    shoulders = _midpoint(points["left_shoulder"], points["right_shoulder"])
    hips = _midpoint(points["left_hip"], points["right_hip"])
    return shoulders[0] - hips[0], shoulders[1] - hips[1]


def _midpoint(
    first: tuple[float, float], second: tuple[float, float]
) -> tuple[float, float]:
    return ((first[0] + second[0]) / 2.0, (first[1] + second[1]) / 2.0)


def _unit_vector(
    start: tuple[float, float], end: tuple[float, float]
) -> tuple[tuple[float, float], float]:
    vector = (end[0] - start[0], end[1] - start[1])
    length = hypot(*vector)
    if length == 0.0:
        return (0.0, 0.0), 0.0
    return (vector[0] / length, vector[1] / length), length


def _wrapped_difference(value: float, reference: float) -> float:
    return (value - reference + 180.0) % 360.0 - 180.0


def _dot(
    first: tuple[float, float], second: tuple[float, float]
) -> float:
    return first[0] * second[0] + first[1] * second[1]

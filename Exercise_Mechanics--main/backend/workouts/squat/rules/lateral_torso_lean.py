"""Person-baseline-relative front-view lateral torso-lean rule."""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, degrees, hypot

from backend.core.keypoints import reference_xy, usable_xy
from backend.engine.range_policy import NumericRangePolicy

RULE_ID = "lateral_torso_lean"
# LIVE requirement. The lean is the trunk vector's direction, which needs shoulders and hips only.
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
)
# BASELINE requirement. Ankles appear here and nowhere else: they orient anatomical left ONCE, at
# construction. They stay in setup.yaml regardless, because knee_valgus and stance_width both need
# them on every live frame — do not remove them there.
BASELINE_KEYPOINTS = REQUIRED_KEYPOINTS + ("left_ankle", "right_ankle")
SIGNAL_MODE = "baseline_relative_angle"


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
    """Measure shoulder-center lean relative to hip center in the frontal plane.

    Baseline ankles define anatomical left independent of mirrored image coordinates. The
    perpendicular axis is oriented toward the baseline shoulders, and the captured upright torso
    angle is subtracted to preserve a person's natural standing alignment and camera roll.

    ANKLES ARE BASELINE-ONLY. They orient the axis once, at construction; the live measurement is the
    trunk vector's direction and needs shoulders and hips alone. Declaring them live took the rule
    offline whenever the feet left frame while measuring nothing extra — a real loss for the target
    setting, where users frame themselves on whatever surface the laptop is on and often crop the
    feet. `knee_valgus` and `stance_width` genuinely DO need ankles live, so a cropped-feet frame
    still disables those two; this change only stops torso-lean coaching going dark alongside them.

    Mirrors the same split already applied to `workouts/bicep_curl/rules/lateral_torso_lean.py`.
    """

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(self, baseline: dict, mode: str) -> None:
        if mode != SIGNAL_MODE:
            raise ValueError(f"unsupported lateral-torso-lean signal mode: {mode!r}")
        points = reference_xy(baseline, BASELINE_KEYPOINTS)
        if points is None:
            raise ValueError("lateral-torso-lean baseline requires all configured keypoints")
        left_axis, stance_width = _unit_vector(
            points["right_ankle"], points["left_ankle"]
        )
        if stance_width == 0:
            raise ValueError("lateral-torso-lean baseline stance width is degenerate")
        baseline_trunk = _trunk_vector(points)
        if hypot(*baseline_trunk) == 0:
            raise ValueError("lateral-torso-lean baseline torso length is degenerate")
        up_axis = (-left_axis[1], left_axis[0])
        if _dot(baseline_trunk, up_axis) < 0:
            up_axis = (-up_axis[0], -up_axis[1])
        self._left_axis = left_axis
        self._up_axis = up_axis
        self._baseline_angle = self._angle(baseline_trunk)

    def read(self, keypoints: dict) -> LateralTorsoLeanSignalReading | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        if points is None:
            return None
        trunk = _trunk_vector(points)
        if hypot(*trunk) == 0:
            return None
        lean_angle = _wrapped_difference(self._angle(trunk), self._baseline_angle)
        return LateralTorsoLeanSignalReading(lean_angle)

    def _angle(self, trunk: tuple[float, float]) -> float:
        return degrees(
            atan2(_dot(trunk, self._left_axis), _dot(trunk, self._up_axis))
        )


class LateralTorsoLeanRule:
    """Classify baseline-relative torso angle with a YAML-owned range table."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(self, baseline: dict, mode: str, ranges: object) -> None:
        self._signal = LateralTorsoLeanSignal(baseline, mode)
        self._policy = NumericRangePolicy(ranges)

    def read(self, keypoints: dict) -> LateralTorsoLeanReading | None:
        signal = self._signal.read(keypoints)
        if signal is None:
            return None
        matched = self._policy.classify(signal.lean_angle_deg)
        return LateralTorsoLeanReading(
            signal.lean_angle_deg,
            matched.state,
            matched.skeleton_color,
            matched.state == "not_ok",
            matched.side,
        )

    def reset(self) -> None:
        """Stateless rule compatibility hook."""


def _trunk_vector(points: dict[str, tuple[float, float]]) -> tuple[float, float]:
    shoulders = _midpoint(points["left_shoulder"], points["right_shoulder"])
    hips = _midpoint(points["left_hip"], points["right_hip"])
    return (shoulders[0] - hips[0], shoulders[1] - hips[1])


def _midpoint(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _unit_vector(
    start: tuple[float, float], end: tuple[float, float]
) -> tuple[tuple[float, float], float]:
    vector = (end[0] - start[0], end[1] - start[1])
    length = hypot(*vector)
    if length == 0:
        return (0.0, 0.0), 0.0
    return (vector[0] / length, vector[1] / length), length


def _wrapped_difference(value: float, reference: float) -> float:
    return (value - reference + 180.0) % 360.0 - 180.0


def _dot(a: tuple[float, float], b: tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]

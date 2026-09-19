"""Person-baseline-relative front-view knee-valgus rule."""

from __future__ import annotations

from dataclasses import dataclass
from math import hypot

from backend.core.keypoints import reference_xy, usable_xy
from backend.engine.range_policy import NumericRangePolicy

RULE_ID = "knee_valgus"
REQUIRED_KEYPOINTS = (
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
)
NORMALIZED_SIGNAL_DECIMALS = 6


@dataclass(frozen=True)
class KneeValgusSignalReading:
    """Inward change from baseline, normalized per leg; positive means more inward."""

    left_inward_delta: float
    right_inward_delta: float
    bilateral_span_collapse: float


@dataclass(frozen=True)
class KneeValgusReading:
    left_inward_delta: float
    right_inward_delta: float
    bilateral_span_collapse: float
    state: str
    skeleton_color: str
    not_ok: bool
    side: str | None              # left | right | both | None


class KneeValgusSignal:
    """Measure each knee's inward offset from its live hip–ankle line.

    The direction toward the body midline and the leg-length normalizers are fixed from the
    per-set standing baseline. Subtracting the baseline offset preserves natural asymmetry;
    translation and uniform image scale cancel from the normalized result.
    """

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        baseline: dict,
    ) -> None:
        points = reference_xy(baseline, REQUIRED_KEYPOINTS)
        if points is None:
            raise ValueError("knee-valgus baseline requires all configured keypoints")

        hip_mid = _midpoint(points["left_hip"], points["right_hip"])
        left_inward, left_half_width = _unit_vector(points["left_hip"], hip_mid)
        right_inward, right_half_width = _unit_vector(points["right_hip"], hip_mid)
        if left_half_width + right_half_width == 0:
            raise ValueError("knee-valgus baseline hip width is degenerate")

        self._inward = {"left": left_inward, "right": right_inward}
        self._leg_length: dict[str, float] = {}
        self._baseline_offset: dict[str, float] = {}
        for side in ("left", "right"):
            hip = points[f"{side}_hip"]
            knee = points[f"{side}_knee"]
            ankle = points[f"{side}_ankle"]
            leg_length = _distance(hip, ankle)
            if leg_length == 0:
                raise ValueError(f"knee-valgus baseline {side} leg is degenerate")
            self._leg_length[side] = leg_length
            offset = _lateral_offset(knee, hip, ankle, self._inward[side])
            if offset is None:
                raise ValueError(f"baseline {side} hip–ankle line is degenerate")
            self._baseline_offset[side] = offset / leg_length
        ankle_span = _distance(points["left_ankle"], points["right_ankle"])
        if ankle_span == 0:
            raise ValueError("knee-valgus baseline ankle span is degenerate")
        self._baseline_span_ratio = (
            _distance(points["left_knee"], points["right_knee"]) / ankle_span
        )

    def read(self, keypoints: dict) -> KneeValgusSignalReading | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        if points is None:
            return None
        values: dict[str, float] = {}
        for side in ("left", "right"):
            offset = _lateral_offset(
                points[f"{side}_knee"],
                points[f"{side}_hip"],
                points[f"{side}_ankle"],
                self._inward[side],
            )
            if offset is None:
                return None
            normalized = offset / self._leg_length[side]
            values[side] = normalized - self._baseline_offset[side]
        ankle_span = _distance(points["left_ankle"], points["right_ankle"])
        if ankle_span == 0:
            return None
        live_span_ratio = (
            _distance(points["left_knee"], points["right_knee"]) / ankle_span
        )
        return KneeValgusSignalReading(
            values["left"],
            values["right"],
            self._baseline_span_ratio - live_span_ratio,
        )


class KneeValgusRule:
    """Classify baseline-relative signals with one configuration-owned warning buffer."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        baseline: dict,
        ranges: object,
    ) -> None:
        self._signal = KneeValgusSignal(baseline)
        self._policy = NumericRangePolicy(ranges)

    def read(self, keypoints: dict) -> KneeValgusReading | None:
        signal = self._signal.read(keypoints)
        if signal is None:
            return None
        left = self._classify(signal.left_inward_delta)
        right = self._classify(signal.right_inward_delta)
        span = self._classify(signal.bilateral_span_collapse)
        left_active = left.state == "not_ok"
        right_active = right.state == "not_ok"
        if left_active and right_active:
            side = "both"
        elif left_active:
            side = "left"
        elif right_active:
            side = "right"
        else:
            side = None
        classifications = (left, right, span)
        state = (
            "not_ok"
            if any(value.state == "not_ok" for value in classifications)
            else "warning"
            if any(value.state == "warning" for value in classifications)
            else "safe"
        )
        selected = next(value for value in classifications if value.state == state)
        not_ok = state == "not_ok"
        return KneeValgusReading(
            signal.left_inward_delta,
            signal.right_inward_delta,
            signal.bilateral_span_collapse,
            state,
            selected.skeleton_color,
            not_ok,
            side,
        )

    def reset(self) -> None:
        """Stateless rule compatibility hook."""

    def _classify(self, value: float):
        return self._policy.classify(round(value, NORMALIZED_SIGNAL_DECIMALS))


def _lateral_offset(
    knee: tuple[float, float],
    hip: tuple[float, float],
    ankle: tuple[float, float],
    inward: tuple[float, float],
) -> float | None:
    leg = (ankle[0] - hip[0], ankle[1] - hip[1])
    leg_length = hypot(*leg)
    if leg_length == 0:
        return None
    knee_from_hip = (knee[0] - hip[0], knee[1] - hip[1])
    scale = _dot(knee_from_hip, leg) / _dot(leg, leg)
    projection = (hip[0] + scale * leg[0], hip[1] + scale * leg[1])
    displacement = (knee[0] - projection[0], knee[1] - projection[1])
    return _dot(displacement, inward)


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


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return hypot(b[0] - a[0], b[1] - a[1])


def _dot(a: tuple[float, float], b: tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]

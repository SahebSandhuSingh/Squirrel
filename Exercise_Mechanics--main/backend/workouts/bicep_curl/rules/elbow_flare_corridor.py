"""Baseline-relative front-view elbow-flare corridor rule."""

from __future__ import annotations

from dataclasses import dataclass
from math import hypot

from backend.core.keypoints import reference_xy, usable_xy
from backend.engine.range_policy import NumericRangePolicy

RULE_ID = "elbow_flare_corridor"
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_hip",
    "right_hip",
)
SIGNAL_MODE = "baseline_relative_elbow_outward_offset"
NORMALIZED_SIGNAL_DECIMALS = 6


@dataclass(frozen=True)
class ElbowFlareSignalReading:
    """Per-side outward change from baseline, in baseline shoulder-widths."""

    left_outward_delta: float
    right_outward_delta: float
    max_outward_delta: float


@dataclass(frozen=True)
class ElbowFlareReading:
    left_outward_delta: float
    right_outward_delta: float
    max_outward_delta: float
    state: str
    skeleton_color: str
    not_ok: bool
    side: str | None  # left | right | both | None


class ElbowFlareSignal:
    """Measure how far each elbow moves outward from its captured corridor.

    The frame-local torso axis removes image translation and rigid lateral torso rotation. Each
    elbow's signed lateral distance from the hip midpoint (the torso centre) is then divided by the
    SET baseline shoulder width and compared with its own baseline value. Keeping both that torso
    anchor and the denominator independent of live shoulder position prevents a shrug or shoulder
    narrowing from inflating the flare signal, while subtracting the person's baseline preserves
    natural arm-position asymmetry.

    Positive means farther away from the torso than baseline. Moving inward is not a flare fault.
    """

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        baseline: dict,
        mode: str,
        *,
        min_shoulder_width_px: float,
        min_torso_length_px: float,
    ) -> None:
        if mode != SIGNAL_MODE:
            raise ValueError(f"unsupported elbow-flare signal mode: {mode!r}")
        self._min_shoulder_width_px = float(min_shoulder_width_px)
        self._min_torso_length_px = float(min_torso_length_px)
        points = reference_xy(baseline, REQUIRED_KEYPOINTS)
        if points is None:
            raise ValueError("elbow-flare baseline requires both shoulders, elbows and hips")
        geometry = self._geometry(points)
        if geometry is None:
            raise ValueError(
                "elbow-flare baseline shoulder width or torso length is implausibly small"
            )
        lateral_axis, shoulder_width, torso_length = geometry
        self._baseline_shoulder_width_px = shoulder_width
        self._baseline_torso_length_px = torso_length
        self._baseline_offset = self._offsets(
            points, lateral_axis, self._baseline_shoulder_width_px
        )

    def read(self, keypoints: dict) -> ElbowFlareSignalReading | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        if points is None:
            return None
        geometry = self._geometry(points)
        if geometry is None:
            return None
        lateral_axis, _, _ = geometry
        offsets = self._offsets(points, lateral_axis, self._baseline_shoulder_width_px)
        left = offsets["left"] - self._baseline_offset["left"]
        right = offsets["right"] - self._baseline_offset["right"]
        return ElbowFlareSignalReading(left, right, max(left, right))

    def baseline_offset(self, side: str) -> float:
        if side not in {"left", "right"}:
            raise ValueError("side must be 'left' or 'right'")
        return self._baseline_offset[side]

    @property
    def baseline_shoulder_width_px(self) -> float:
        return self._baseline_shoulder_width_px

    @property
    def baseline_torso_length_px(self) -> float:
        return self._baseline_torso_length_px

    def _geometry(
        self,
        points: dict[str, tuple[float, float]],
    ) -> tuple[tuple[float, float], float, float] | None:
        shoulder_mid = _midpoint(points["left_shoulder"], points["right_shoulder"])
        hip_mid = _midpoint(points["left_hip"], points["right_hip"])
        torso = (shoulder_mid[0] - hip_mid[0], shoulder_mid[1] - hip_mid[1])
        torso_length = hypot(*torso)
        if torso_length < self._min_torso_length_px:
            return None
        up_axis = (torso[0] / torso_length, torso[1] / torso_length)
        lateral_axis = (-up_axis[1], up_axis[0])
        shoulder_span = (
            points["left_shoulder"][0] - points["right_shoulder"][0],
            points["left_shoulder"][1] - points["right_shoulder"][1],
        )
        if _dot(shoulder_span, lateral_axis) < 0:
            lateral_axis = (-lateral_axis[0], -lateral_axis[1])
        shoulder_width = _dot(shoulder_span, lateral_axis)
        if shoulder_width < self._min_shoulder_width_px:
            return None
        return lateral_axis, shoulder_width, torso_length

    @staticmethod
    def _offsets(
        points: dict[str, tuple[float, float]],
        lateral_axis: tuple[float, float],
        denominator: float,
    ) -> dict[str, float]:
        hip_mid = _midpoint(points["left_hip"], points["right_hip"])
        left = _dot(_subtract(points["left_elbow"], hip_mid), lateral_axis) / denominator
        right = -_dot(_subtract(points["right_elbow"], hip_mid), lateral_axis) / denominator
        return {"left": left, "right": right}


class ElbowFlareRule:
    """Classify both baseline-relative corridor departures with one YAML range table."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        baseline: dict,
        mode: str,
        ranges: object,
        *,
        min_shoulder_width_px: float,
        min_torso_length_px: float,
    ) -> None:
        self._signal = ElbowFlareSignal(
            baseline,
            mode,
            min_shoulder_width_px=min_shoulder_width_px,
            min_torso_length_px=min_torso_length_px,
        )
        self._policy = NumericRangePolicy(ranges)

    def read(self, keypoints: dict) -> ElbowFlareReading | None:
        signal = self._signal.read(keypoints)
        if signal is None:
            return None
        left = self._classify(signal.left_outward_delta)
        right = self._classify(signal.right_outward_delta)
        left_fault = left.state == "not_ok"
        right_fault = right.state == "not_ok"
        if left_fault and right_fault:
            side = "both"
        elif left_fault:
            side = "left"
        elif right_fault:
            side = "right"
        else:
            side = None
        classifications = (left, right)
        state = (
            "not_ok"
            if any(value.state == "not_ok" for value in classifications)
            else "warning"
            if any(value.state == "warning" for value in classifications)
            else "safe"
        )
        selected = next(value for value in classifications if value.state == state)
        return ElbowFlareReading(
            signal.left_outward_delta,
            signal.right_outward_delta,
            signal.max_outward_delta,
            state,
            selected.skeleton_color,
            state == "not_ok",
            side,
        )

    def reset(self) -> None:
        """Stateless rule compatibility hook."""

    def baseline_offset(self, side: str) -> float:
        return self._signal.baseline_offset(side)

    @property
    def baseline_shoulder_width_px(self) -> float:
        return self._signal.baseline_shoulder_width_px

    @property
    def baseline_torso_length_px(self) -> float:
        return self._signal.baseline_torso_length_px

    def _classify(self, value: float):
        return self._policy.classify(round(value, NORMALIZED_SIGNAL_DECIMALS))


def _midpoint(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _subtract(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return a[0] - b[0], a[1] - b[1]


def _dot(a: tuple[float, float], b: tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]

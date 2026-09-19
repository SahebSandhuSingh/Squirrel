"""Baseline-relative front-view knee-tracking corridor for High Knees.

The lifted knee is measured laterally from the live hip midpoint along the live body-horizontal
axis. Its standing baseline offset is subtracted and the change is normalized by baseline
shoulder width. Translation and rigid image roll therefore cancel, while the captured baseline
preserves a person's natural left/right stance asymmetry.

The signed delta is retained for diagnostics; classification uses its absolute value because both
an inward collapse and an outward drift are undesirable. Availability is independent per knee so
temporary loss of the resting leg does not suppress the lifted leg's evidence.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import hypot, isfinite

from backend.core.keypoints import reference_xy, usable_xy
from backend.engine.range_policy import NumericRangePolicy

RULE_ID = "knee_tracking_corridor"
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
)
SIGNAL_MODE = "baseline_relative_lateral_drift"
NORMALIZED_SIGNAL_DECIMALS = 6

_COMMON_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
)
_SIDES = ("left", "right")


@dataclass(frozen=True)
class KneeTrackingSignalReading:
    """Signed per-side change and absolute maximum, in baseline shoulder-widths."""

    left_lateral_delta: float | None
    right_lateral_delta: float | None
    max_lateral_drift: float | None
    left_available: bool
    right_available: bool


@dataclass(frozen=True)
class KneeTrackingReading:
    left_lateral_delta: float | None
    right_lateral_delta: float | None
    max_lateral_drift: float | None
    left_available: bool
    right_available: bool
    left_state: str | None
    right_state: str | None
    left_not_ok: bool | None
    right_not_ok: bool | None
    state: str | None
    skeleton_color: str | None
    not_ok: bool
    side: str | None  # left | right | both | None


class KneeTrackingSignal:
    """Measure each knee's lateral departure from its captured standing corridor."""

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
            raise ValueError(f"unsupported knee-tracking signal mode: {mode!r}")
        for value, label in (
            (min_shoulder_width_px, "minimum shoulder width"),
            (min_torso_length_px, "minimum torso length"),
        ):
            if not isfinite(value) or value <= 0.0:
                raise ValueError(f"{label} must be finite and positive, got {value}")

        points = reference_xy(baseline, REQUIRED_KEYPOINTS)
        if points is None:
            raise ValueError(
                "knee-tracking baseline requires finite shoulders, hips and knees"
            )
        geometry = _body_geometry(
            points,
            min_shoulder_width_px=float(min_shoulder_width_px),
            min_torso_length_px=float(min_torso_length_px),
        )
        if geometry is None:
            raise ValueError(
                "knee-tracking baseline shoulder width or torso length is implausibly small"
            )
        lateral_axis, shoulder_width = geometry
        self._baseline_shoulder_width_px = shoulder_width
        self._baseline_offsets = _outward_offsets(
            points, lateral_axis, shoulder_width
        )
        self._min_shoulder_width_px = float(min_shoulder_width_px)
        self._min_torso_length_px = float(min_torso_length_px)

    def read(self, keypoints: dict) -> KneeTrackingSignalReading:
        common = usable_xy(keypoints, _COMMON_KEYPOINTS)
        if common is None or not _landmarks_finite(keypoints, _COMMON_KEYPOINTS):
            return _unavailable_signal()
        geometry = _body_geometry(
            common,
            min_shoulder_width_px=self._min_shoulder_width_px,
            min_torso_length_px=self._min_torso_length_px,
        )
        if geometry is None:
            return _unavailable_signal()
        lateral_axis, _ = geometry

        deltas: dict[str, float | None] = {}
        available: dict[str, bool] = {}
        for side in _SIDES:
            name = f"{side}_knee"
            knee = usable_xy(keypoints, (name,))
            if knee is None or not _landmarks_finite(keypoints, (name,)):
                deltas[side] = None
                available[side] = False
                continue
            points = {**common, name: knee[name]}
            offset = _outward_offset(
                points,
                lateral_axis,
                self._baseline_shoulder_width_px,
                side,
            )
            delta = offset - self._baseline_offsets[side]
            if not isfinite(delta):
                deltas[side] = None
                available[side] = False
                continue
            deltas[side] = delta
            available[side] = True

        observed = [abs(value) for value in deltas.values() if value is not None]
        return KneeTrackingSignalReading(
            left_lateral_delta=deltas["left"],
            right_lateral_delta=deltas["right"],
            max_lateral_drift=max(observed) if observed else None,
            left_available=available["left"],
            right_available=available["right"],
        )

    def baseline_offset(self, side: str) -> float:
        if side not in _SIDES:
            raise ValueError(f"side must be one of {_SIDES}, got {side!r}")
        return self._baseline_offsets[side]

    @property
    def baseline_shoulder_width_px(self) -> float:
        return self._baseline_shoulder_width_px


class KneeTrackingCorridorRule:
    """Classify independent per-side lateral drift with one YAML range table."""

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
        self._signal = KneeTrackingSignal(
            baseline,
            mode,
            min_shoulder_width_px=min_shoulder_width_px,
            min_torso_length_px=min_torso_length_px,
        )
        self._policy = NumericRangePolicy(ranges)

    def read(self, keypoints: dict) -> KneeTrackingReading:
        signal = self._signal.read(keypoints)
        classifications = {}
        for side in _SIDES:
            delta = getattr(signal, f"{side}_lateral_delta")
            classifications[side] = (
                None if delta is None else self._classify(abs(delta))
            )

        left_not_ok = _is_not_ok(classifications["left"])
        right_not_ok = _is_not_ok(classifications["right"])
        if left_not_ok is True and right_not_ok is True:
            side = "both"
        elif left_not_ok is True:
            side = "left"
        elif right_not_ok is True:
            side = "right"
        else:
            side = None

        available_classifications = [
            value for value in classifications.values() if value is not None
        ]
        state = _worst_state(available_classifications)
        selected = next(
            (value for value in available_classifications if value.state == state),
            None,
        )
        return KneeTrackingReading(
            left_lateral_delta=signal.left_lateral_delta,
            right_lateral_delta=signal.right_lateral_delta,
            max_lateral_drift=signal.max_lateral_drift,
            left_available=signal.left_available,
            right_available=signal.right_available,
            left_state=(
                classifications["left"].state
                if classifications["left"] is not None
                else None
            ),
            right_state=(
                classifications["right"].state
                if classifications["right"] is not None
                else None
            ),
            left_not_ok=left_not_ok,
            right_not_ok=right_not_ok,
            state=state,
            skeleton_color=(selected.skeleton_color if selected is not None else None),
            not_ok=left_not_ok is True or right_not_ok is True,
            side=side,
        )

    def reset(self) -> None:
        """Stateless rule compatibility hook."""

    def baseline_offset(self, side: str) -> float:
        return self._signal.baseline_offset(side)

    @property
    def baseline_shoulder_width_px(self) -> float:
        return self._signal.baseline_shoulder_width_px

    def _classify(self, value: float):
        return self._policy.classify(round(value, NORMALIZED_SIGNAL_DECIMALS))


def _body_geometry(
    points: dict[str, tuple[float, float]],
    *,
    min_shoulder_width_px: float,
    min_torso_length_px: float,
) -> tuple[tuple[float, float], float] | None:
    shoulder_mid = _midpoint(points["left_shoulder"], points["right_shoulder"])
    hip_mid = _midpoint(points["left_hip"], points["right_hip"])
    torso = _subtract(shoulder_mid, hip_mid)
    torso_length = hypot(*torso)
    if not isfinite(torso_length) or torso_length < min_torso_length_px:
        return None
    up_axis = (torso[0] / torso_length, torso[1] / torso_length)
    lateral_axis = (-up_axis[1], up_axis[0])
    shoulder_span = _subtract(points["left_shoulder"], points["right_shoulder"])
    if _dot(shoulder_span, lateral_axis) < 0.0:
        lateral_axis = (-lateral_axis[0], -lateral_axis[1])
    shoulder_width = _dot(shoulder_span, lateral_axis)
    if not isfinite(shoulder_width) or shoulder_width < min_shoulder_width_px:
        return None
    return lateral_axis, shoulder_width


def _outward_offsets(
    points: dict[str, tuple[float, float]],
    lateral_axis: tuple[float, float],
    denominator: float,
) -> dict[str, float]:
    return {
        side: _outward_offset(points, lateral_axis, denominator, side)
        for side in _SIDES
    }


def _outward_offset(
    points: dict[str, tuple[float, float]],
    lateral_axis: tuple[float, float],
    denominator: float,
    side: str,
) -> float:
    hip_mid = _midpoint(points["left_hip"], points["right_hip"])
    displacement = _subtract(points[f"{side}_knee"], hip_mid)
    signed = _dot(displacement, lateral_axis)
    return (signed if side == "left" else -signed) / denominator


def _unavailable_signal() -> KneeTrackingSignalReading:
    return KneeTrackingSignalReading(None, None, None, False, False)


def _is_not_ok(classification) -> bool | None:
    return None if classification is None else classification.state == "not_ok"


def _worst_state(classifications: list) -> str | None:
    for state in ("not_ok", "warning", "safe"):
        if any(value.state == state for value in classifications):
            return state
    return None


def _landmarks_finite(keypoints: dict, names: tuple[str, ...]) -> bool:
    return all(
        isfinite(float(keypoints[name][field]))
        for name in names
        for field in ("x", "y", "v")
    )


def _midpoint(
    first: tuple[float, float], second: tuple[float, float]
) -> tuple[float, float]:
    return ((first[0] + second[0]) / 2.0, (first[1] + second[1]) / 2.0)


def _subtract(
    first: tuple[float, float], second: tuple[float, float]
) -> tuple[float, float]:
    return first[0] - second[0], first[1] - second[1]


def _dot(
    first: tuple[float, float], second: tuple[float, float]
) -> float:
    return first[0] * second[0] + first[1] * second[1]

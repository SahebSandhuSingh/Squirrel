"""Person-baseline-relative front-view lateral torso-lean rule for bicep curl."""

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
# construction. They are guaranteed present because the stance pre-check runs before the baseline
# capture and needs them, which is also what keeps them in setup.yaml - do not remove them there.
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

    ANKLES ARE BASELINE-ONLY. They orient the axis once, at construction; the live measurement is
    the trunk vector's direction and needs shoulders and hips alone. Requiring them live would take
    the rule offline whenever the feet leave frame - a real risk for a standing upper-body exercise
    people often frame from the waist up - while measuring nothing extra. Hence the split between
    `REQUIRED_KEYPOINTS` (live) and `BASELINE_KEYPOINTS`.

    Measured aside: a hip-derived axis gives bit-identical results to the ankle-derived one across
    2825 frames of labelled capture, because the axis is only a FRAME and any tilt cancels in
    `live - baseline`. Ankles are kept for continuity with squat, not because they measure better.

    This is an exercise-local copy of the proven squat geometry. It intentionally has no runtime
    dependency on the squat package so curl thresholds and diagnostics can evolve independently.

    LIVE PLAUSIBILITY FLOOR. The reported angle is the direction of the hip-to-shoulder line, so its
    noise scales inversely with that line's LENGTH: one pixel of landmark jitter moves the angle
    0.34 degrees across a healthy 170px torso, but 26 degrees across a 2px one. When tracking
    degrades — the person steps back, leaves frame, or the skeleton momentarily collapses — MediaPipe
    still returns confident landmarks, and a near-zero torso turns a pixel of noise into a fault-sized
    lean. `min_torso_length_px` refuses those frames instead of publishing an angle nobody measured.

    BASELINE FLOOR, AND WHY IT IS THE STRICTER OF THE TWO. The reported angle is
    `live_angle - baseline_angle`. The baseline angle is one of those two terms, measured ONCE and
    reused for the whole set, so an error in it has nothing to cancel against and biases every rep.
    Measured against a healthy live frame holding a true 6 deg left lean: a 2px baseline torso
    reports -20.6 deg, i.e. a 20 deg lean to the RIGHT. Wrong magnitude and wrong side, so the HUD
    highlights the wrong shoulder for the entire set. Construction therefore RAISES rather than
    abstaining: the capture can be redone, a set scored against a broken zero cannot.

    Nothing upstream catches this. The baseline capture gates (`min_valid_samples`,
    `min_valid_coverage`, `max_joint_stddev_px`) all measure STABILITY, not plausibility - a
    collapsed pose held still has near-zero stddev and passes every one of them.

    NOT GUARDED, DELIBERATELY: the baseline ankle stance width. It only sets the FRAME both angles
    are measured in, so any tilt shifts both terms equally and cancels exactly - verified to +0.00
    deg error at a 63 deg axis tilt. The axis must be consistent, not correct, and being computed
    once makes it consistent by definition. `== 0` is genuinely sufficient there.

    DIVERGENCE FROM SQUAT, DELIBERATE. The squat original guards both torso checks with `== 0`,
    which almost never fires on real float data. Logged as a separate task rather than fixed in
    place, because squat is `ready` and carries parity tests. See:
        coding_agents/claude_code/workout_libraries/bicep_curl/logs/
            2026-07-20-squat-lateral-torso-lean-plausibility-guards.md
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
        self._min_torso_length_px = float(min_torso_length_px)
        points = reference_xy(baseline, BASELINE_KEYPOINTS)
        if points is None:
            raise ValueError("lateral-torso-lean baseline requires all configured keypoints")
        left_axis, stance_width = _unit_vector(
            points["right_ankle"], points["left_ankle"]
        )
        if stance_width == 0:
            raise ValueError("lateral-torso-lean baseline stance width is degenerate")
        baseline_trunk = _trunk_vector(points)
        # The baseline angle is one of the two terms in `live - baseline`, so an error here has
        # nothing to cancel against and biases EVERY rep of the set. Refuse to build rather than
        # run a whole set against a broken zero; the capture can be redone, the set cannot.
        if hypot(*baseline_trunk) < self._min_torso_length_px:
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
        # Not `== 0`: below this length the angle is noise amplification, not a measurement.
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
    """Classify baseline-relative torso angle with a YAML-owned range table."""

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
            baseline, mode, min_torso_length_px=min_torso_length_px
        )
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

    @property
    def baseline_angle_deg(self) -> float:
        return self._signal.baseline_angle_deg


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

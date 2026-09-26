"""Front-view standing setup and baseline geometry for High Knee.

One setup-only rule owns the coupled readiness checks because they share the same body-local frame.
It does not participate in live scoring or cue ranks 1-4.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import acos, atan2, degrees, hypot, isfinite

from backend.core.keypoints import reference_xy, usable_xy

RULE_ID = "setup_readiness"
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
)


@dataclass(frozen=True)
class HighKneeSetupReading:
    front_facing: bool
    reference_lengths_plausible: bool
    knees_extended: bool
    feet_down: bool
    stance_stable: bool
    vertical_order_valid: bool
    passed: bool
    measurements: dict[str, object]


class HighKneeSetupReadinessRule:
    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(self, policy: dict) -> None:
        self._min_shoulder_width = float(policy["min_shoulder_width_px"])
        self._min_hip_width = float(policy["min_hip_width_px"])
        self._min_torso_length = float(policy["min_torso_length_px"])
        self._min_upper_leg = float(policy["min_upper_leg_px"])
        self._min_lower_leg = float(policy["min_lower_leg_px"])
        self._max_side_ratio = float(policy["max_side_length_ratio"])
        self._min_knee_angle = float(policy["min_knee_extension_deg"])
        self._min_stance_ratio = float(policy["min_stance_ratio"])
        self._max_stance_ratio = float(policy["max_stance_ratio"])
        self._max_foot_height_ratio = float(
            policy["max_foot_height_difference_ratio"]
        )

    def read(self, keypoints: dict) -> HighKneeSetupReading | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        return None if points is None else self._evaluate(points)

    def read_reference(self, keypoints: dict) -> HighKneeSetupReading | None:
        points = reference_xy(keypoints, REQUIRED_KEYPOINTS)
        return None if points is None else self._evaluate(points)

    def _evaluate(
        self,
        points: dict[str, tuple[float, float]],
    ) -> HighKneeSetupReading | None:
        if any(not isfinite(value) for point in points.values() for value in point):
            return None
        shoulder_mid = _midpoint(points["left_shoulder"], points["right_shoulder"])
        hip_mid = _midpoint(points["left_hip"], points["right_hip"])
        torso = _subtract(shoulder_mid, hip_mid)
        torso_length = hypot(*torso)
        if torso_length == 0:
            return None
        up_axis = (torso[0] / torso_length, torso[1] / torso_length)
        lateral_axis = (-up_axis[1], up_axis[0])
        shoulder_vector = _subtract(points["left_shoulder"], points["right_shoulder"])
        if _dot(shoulder_vector, lateral_axis) < 0:
            lateral_axis = (-lateral_axis[0], -lateral_axis[1])

        bilateral = {
            joint: _dot(
                _subtract(points[f"left_{joint}"], points[f"right_{joint}"]),
                lateral_axis,
            )
            for joint in ("shoulder", "hip", "knee", "ankle")
        }
        shoulder_width = bilateral["shoulder"]
        hip_width = bilateral["hip"]
        orientation_consistent = all(value > 0 for value in bilateral.values())

        upper_lengths = {
            side: _distance(points[f"{side}_hip"], points[f"{side}_knee"])
            for side in ("left", "right")
        }
        lower_lengths = {
            side: _distance(points[f"{side}_knee"], points[f"{side}_ankle"])
            for side in ("left", "right")
        }
        if min(*upper_lengths.values(), *lower_lengths.values(), shoulder_width) <= 0:
            return None
        side_length_ratio = max(
            _symmetric_ratio(upper_lengths["left"], upper_lengths["right"]),
            _symmetric_ratio(lower_lengths["left"], lower_lengths["right"]),
        )
        front_facing = (
            orientation_consistent
            and shoulder_width >= self._min_shoulder_width
            and hip_width >= self._min_hip_width
            and torso_length >= self._min_torso_length
            and side_length_ratio <= self._max_side_ratio
        )

        left_angle = _joint_angle(
            points["left_hip"], points["left_knee"], points["left_ankle"]
        )
        right_angle = _joint_angle(
            points["right_hip"], points["right_knee"], points["right_ankle"]
        )
        if left_angle is None or right_angle is None:
            return None
        knees_extended = (
            left_angle >= self._min_knee_angle
            and right_angle >= self._min_knee_angle
        )
        reference_lengths_plausible = (
            torso_length >= self._min_torso_length
            and shoulder_width >= self._min_shoulder_width
            and hip_width >= self._min_hip_width
            and all(length >= self._min_upper_leg for length in upper_lengths.values())
            and all(length >= self._min_lower_leg for length in lower_lengths.values())
        )

        hip_knee_gaps = {
            side: _dot(
                _subtract(points[f"{side}_hip"], points[f"{side}_knee"]),
                up_axis,
            )
            for side in ("left", "right")
        }
        knee_ankle_gaps = {
            side: _dot(
                _subtract(points[f"{side}_knee"], points[f"{side}_ankle"]),
                up_axis,
            )
            for side in ("left", "right")
        }
        vertical_order_valid = all(
            value > 0 for value in (*hip_knee_gaps.values(), *knee_ankle_gaps.values())
        )
        foot_height_difference_ratio = abs(
            _dot(
                _subtract(points["left_ankle"], points["right_ankle"]),
                up_axis,
            )
        ) / torso_length
        feet_down = foot_height_difference_ratio <= self._max_foot_height_ratio
        stance_ratio = bilateral["ankle"] / shoulder_width
        stance_stable = self._min_stance_ratio <= stance_ratio <= self._max_stance_ratio

        measurements: dict[str, object] = {
            "shoulder_midpoint": _rounded_point(shoulder_mid),
            "hip_midpoint": _rounded_point(hip_mid),
            "shoulder_width_px": round(shoulder_width, 3),
            "hip_width_px": round(hip_width, 3),
            "body_up_axis": _rounded_point(up_axis, 6),
            "body_lateral_axis": _rounded_point(lateral_axis, 6),
            "torso_length_px": round(torso_length, 3),
            "torso_angle_deg": round(degrees(atan2(up_axis[1], up_axis[0])), 3),
            "hip_to_knee_resting_gap_px": _rounded_sides(hip_knee_gaps),
            "hip_to_knee_length_px": _rounded_sides(upper_lengths),
            "knee_to_ankle_length_px": _rounded_sides(lower_lengths),
            "resting_knee_lateral_offset_px": {
                side: round(
                    _dot(
                        _subtract(points[f"{side}_knee"], points[f"{side}_hip"]),
                        lateral_axis,
                    ),
                    3,
                )
                for side in ("left", "right")
            },
            "resting_ankle_lateral_offset_px": {
                side: round(
                    _dot(
                        _subtract(points[f"{side}_ankle"], points[f"{side}_hip"]),
                        lateral_axis,
                    ),
                    3,
                )
                for side in ("left", "right")
            },
            "left_knee_angle_deg": round(left_angle, 3),
            "right_knee_angle_deg": round(right_angle, 3),
            "stance_ratio": round(stance_ratio, 6),
            "foot_height_difference_ratio": round(foot_height_difference_ratio, 6),
            "side_length_ratio": round(side_length_ratio, 6),
            "anatomical_left_image_x_sign": (
                "positive"
                if points["left_shoulder"][0] > points["right_shoulder"][0]
                else "negative"
            ),
        }
        passed = all(
            (
                front_facing,
                reference_lengths_plausible,
                knees_extended,
                feet_down,
                stance_stable,
                vertical_order_valid,
            )
        )
        return HighKneeSetupReading(
            front_facing,
            reference_lengths_plausible,
            knees_extended,
            feet_down,
            stance_stable,
            vertical_order_valid,
            passed,
            measurements,
        )


def failure_reason(reading: HighKneeSetupReading) -> str | None:
    """Stable adapter-facing failure taxonomy."""
    if not reading.front_facing:
        return "not_front_facing"
    if not reading.reference_lengths_plausible or not reading.vertical_order_valid:
        return "reference_geometry_implausible"
    if not reading.knees_extended:
        return "knees_not_extended"
    if not reading.feet_down:
        return "both_feet_not_down"
    if not reading.stance_stable:
        return "starting_stance_unstable"
    return None


def _midpoint(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _subtract(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return (a[0] - b[0], a[1] - b[1])


def _dot(a: tuple[float, float], b: tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return hypot(a[0] - b[0], a[1] - b[1])


def _symmetric_ratio(a: float, b: float) -> float:
    return max(a, b) / min(a, b)


def _joint_angle(
    proximal: tuple[float, float],
    joint: tuple[float, float],
    distal: tuple[float, float],
) -> float | None:
    first = _subtract(proximal, joint)
    second = _subtract(distal, joint)
    denominator = hypot(*first) * hypot(*second)
    if denominator == 0:
        return None
    cosine = max(-1.0, min(1.0, _dot(first, second) / denominator))
    return degrees(acos(cosine))


def _rounded_point(point: tuple[float, float], digits: int = 3) -> dict[str, float]:
    return {"x": round(point[0], digits), "y": round(point[1], digits)}


def _rounded_sides(values: dict[str, float]) -> dict[str, float]:
    return {side: round(value, 3) for side, value in values.items()}

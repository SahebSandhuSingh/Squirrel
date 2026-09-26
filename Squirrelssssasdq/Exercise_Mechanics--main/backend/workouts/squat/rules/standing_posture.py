"""Squat standing-posture condition for setup and persisted baselines."""

from __future__ import annotations

from dataclasses import dataclass
from math import acos, degrees, hypot

from backend.core.keypoints import reference_xy, usable_xy

RULE_ID = "standing_posture"
REQUIRED_KEYPOINTS = (
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
)


@dataclass(frozen=True)
class StandingPostureReading:
    left_knee_angle_deg: float
    right_knee_angle_deg: float
    hip_above_knee: bool
    passed: bool


class StandingPostureRule:
    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        *,
        min_knee_extension_deg: float,
        require_hip_above_knee: bool,
    ) -> None:
        self._minimum_angle = float(min_knee_extension_deg)
        self._require_hip_above = bool(require_hip_above_knee)

    def read(self, keypoints: dict) -> StandingPostureReading | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        return None if points is None else self._evaluate(points)

    def read_reference(self, keypoints: dict) -> StandingPostureReading | None:
        points = reference_xy(keypoints, REQUIRED_KEYPOINTS)
        return None if points is None else self._evaluate(points)

    def _evaluate(
        self,
        points: dict[str, tuple[float, float]],
    ) -> StandingPostureReading | None:
        left = _joint_angle(points["left_hip"], points["left_knee"], points["left_ankle"])
        right = _joint_angle(points["right_hip"], points["right_knee"], points["right_ankle"])
        if left is None or right is None:
            return None
        hip_y = (points["left_hip"][1] + points["right_hip"][1]) / 2
        knee_y = (points["left_knee"][1] + points["right_knee"][1]) / 2
        hip_above = hip_y < knee_y
        passed = (
            left >= self._minimum_angle
            and right >= self._minimum_angle
            and (hip_above or not self._require_hip_above)
        )
        return StandingPostureReading(
            round(left, 3),
            round(right, 3),
            hip_above,
            passed,
        )


def _joint_angle(
    proximal: tuple[float, float],
    joint: tuple[float, float],
    distal: tuple[float, float],
) -> float | None:
    first = (proximal[0] - joint[0], proximal[1] - joint[1])
    second = (distal[0] - joint[0], distal[1] - joint[1])
    first_length = hypot(*first)
    second_length = hypot(*second)
    if first_length == 0 or second_length == 0:
        return None
    cosine = (first[0] * second[0] + first[1] * second[1]) / (
        first_length * second_length
    )
    return degrees(acos(max(-1.0, min(1.0, cosine))))

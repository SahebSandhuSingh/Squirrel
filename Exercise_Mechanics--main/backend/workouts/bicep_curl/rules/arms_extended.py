"""Bicep curl arms-extended condition for setup pre-check and persisted baselines.

The curl analog of squat's standing_posture: before the timer + baseline start, both arms must hang
extended (each elbow angle at or above the configured minimum). Runs only during setup — never live.
Kept self-contained (its own joint-angle helper) to match the squat setup-rule convention.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import acos, degrees, hypot

from backend.core.keypoints import reference_xy, usable_xy

RULE_ID = "arms_extended"
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
)


@dataclass(frozen=True)
class ArmsExtendedReading:
    left_elbow_angle_deg: float
    right_elbow_angle_deg: float
    passed: bool


class ArmsExtendedRule:
    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(self, *, min_elbow_extension_deg: float) -> None:
        self._minimum_angle = float(min_elbow_extension_deg)

    def read(self, keypoints: dict) -> ArmsExtendedReading | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        return None if points is None else self._evaluate(points)

    def read_reference(self, keypoints: dict) -> ArmsExtendedReading | None:
        points = reference_xy(keypoints, REQUIRED_KEYPOINTS)
        return None if points is None else self._evaluate(points)

    def _evaluate(
        self,
        points: dict[str, tuple[float, float]],
    ) -> ArmsExtendedReading | None:
        left = _joint_angle(
            points["left_shoulder"], points["left_elbow"], points["left_wrist"]
        )
        right = _joint_angle(
            points["right_shoulder"], points["right_elbow"], points["right_wrist"]
        )
        if left is None or right is None:
            return None
        passed = left >= self._minimum_angle and right >= self._minimum_angle
        return ArmsExtendedReading(round(left, 3), round(right, 3), passed)


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

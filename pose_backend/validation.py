"""Per-frame setup validation, including the mandatory side-on camera check.

Four checks, all run on every frame (the user can drift out of position
mid-set, so none of them is a one-time setup gate):

    multiple_people_detected            more than one person in frame
    body_not_fully_visible              a body region is outside the frame
    low_confidence                      a key joint is below the visibility gate
    wrong_orientation_needs_side_view   camera is front-on, not side-on

Reporting order is data, not control flow: see ``VALIDATION_PRIORITY`` in
config.py. When several checks fail, the highest-priority reason is reported —
it is the one the user must fix first.

When any check fails, the frame's joint angles are NOT computed and the
classifier does not run: an angle derived from unreliable or wrongly projected
landmarks is worse than no angle, because the next module would count reps off it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, Optional

from .config import (
    FRAME_BOUNDS_TOLERANCE,
    MULTI_PERSON_CLEAR_FRAMES,
    MULTI_PERSON_CONSECUTIVE_HITS,
    MIN_KEY_JOINT_VISIBILITY,
    ORIENTATION_BAD_FRAMES_TO_FLAG,
    ORIENTATION_GOOD_FRAMES_TO_CLEAR,
    ORIENTATION_MIN_TORSO_LENGTH,
    SIDE_VIEW_HIP_SPREAD_MAX_RATIO,
    SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO,
    VALIDATION_PRIORITY,
)
from .exercises.base import ExerciseDefinition
from .geometry import distance
from .landmarks import FULL_BODY_GROUPS, LM, PoseLandmarks

__all__ = [
    "OrientationCheck",
    "ValidationOutcome",
    "FrameValidator",
    "MultiPersonGate",
    "check_orientation",
]


class MultiPersonGate:
    """Hysteresis around the pose model's per-frame person count.

    The count comes from the pose model itself (it is asked for up to
    ``POSE_MAX_POSES_DETECTED`` poses), so it is available every frame at no
    extra cost. Raw counts still flicker — a mirror, a chair that reads as a
    torso for a frame — so a session only reports a second person after
    ``MULTI_PERSON_CONSECUTIVE_HITS`` consecutive multi-pose frames, and only
    clears after ``MULTI_PERSON_CLEAR_FRAMES`` consecutive single-pose frames.
    """

    __slots__ = ("_hits", "_clears", "_flagged")

    def __init__(self) -> None:
        self._hits = 0
        self._clears = 0
        self._flagged = False

    def update(self, person_count: Optional[int]) -> bool:
        """Feed one frame's person count; return the current verdict.

        ``person_count is None`` means the estimator cannot count people. The
        check is then SKIPPED rather than guessed at, and the verdict is left
        where it was.
        """
        if person_count is None:
            return self._flagged
        if person_count > 1:
            self._hits += 1
            self._clears = 0
            if self._hits >= MULTI_PERSON_CONSECUTIVE_HITS:
                self._flagged = True
        else:
            self._clears += 1
            self._hits = 0
            if self._flagged and self._clears >= MULTI_PERSON_CLEAR_FRAMES:
                self._flagged = False
        return self._flagged

    def reset(self) -> None:
        self._hits = 0
        self._clears = 0
        self._flagged = False


@dataclass(frozen=True)
class OrientationCheck:
    """Result of the side-on camera check for one frame."""

    is_side_on: bool
    #: |x_left - x_right| / torso_length for shoulders and hips. Small = side-on.
    shoulder_spread_ratio: float
    hip_spread_ratio: float
    #: Aspect-corrected shoulder-mid to hip-mid distance, in normalised units.
    torso_length: float
    #: "front_on" | "torso_too_small" | None (when side-on).
    reason: Optional[str] = None

    def as_dict(self) -> Dict[str, float]:
        return {
            "shoulder_spread_ratio": _round(self.shoulder_spread_ratio),
            "hip_spread_ratio": _round(self.hip_spread_ratio),
            "torso_length": _round(self.torso_length),
            "shoulder_spread_limit": SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO,
            "hip_spread_limit": SIDE_VIEW_HIP_SPREAD_MAX_RATIO,
        }


def check_orientation(lms: PoseLandmarks) -> OrientationCheck:
    """Decide whether this frame shows a SIDE-ON view.

    Geometry: seen from the side, the left and right shoulders sit almost on top
    of each other in the image (they are separated along the camera axis), so
    their horizontal separation is small. Seen from the front they are separated
    by the full shoulder width. Dividing by torso length makes the test
    invariant to how far away the user is, and it holds for both exercises —
    including push-ups, where the torso is horizontal but the shoulder-to-
    shoulder axis still points toward the camera.
    """
    left_shoulder = lms.point(LM.LEFT_SHOULDER)
    right_shoulder = lms.point(LM.RIGHT_SHOULDER)
    left_hip = lms.point(LM.LEFT_HIP)
    right_hip = lms.point(LM.RIGHT_HIP)
    shoulder_mid = lms.mid_point(LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER)
    hip_mid = lms.mid_point(LM.LEFT_HIP, LM.RIGHT_HIP)

    torso_length = distance(shoulder_mid, hip_mid)
    if torso_length < ORIENTATION_MIN_TORSO_LENGTH:
        # Too far away or badly cropped: the ratios below would be meaningless.
        return OrientationCheck(
            is_side_on=False,
            shoulder_spread_ratio=float("nan"),
            hip_spread_ratio=float("nan"),
            torso_length=torso_length,
            reason="torso_too_small",
        )

    shoulder_ratio = abs(left_shoulder[0] - right_shoulder[0]) / torso_length
    hip_ratio = abs(left_hip[0] - right_hip[0]) / torso_length
    side_on = (
        shoulder_ratio <= SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO
        and hip_ratio <= SIDE_VIEW_HIP_SPREAD_MAX_RATIO
    )
    return OrientationCheck(
        is_side_on=side_on,
        shoulder_spread_ratio=shoulder_ratio,
        hip_spread_ratio=hip_ratio,
        torso_length=torso_length,
        reason=None if side_on else "front_on",
    )


@dataclass
class ValidationOutcome:
    """What validation decided about one frame."""

    #: "ok" or one of the failure reasons.
    status: str = "ok"
    #: Machine-readable extra context, e.g. "missing:ankles" or "front_on".
    detail: Optional[str] = None
    orientation: Dict[str, float] = field(default_factory=dict)
    min_key_joint_visibility: Optional[float] = None

    @property
    def ok(self) -> bool:
        return self.status == "ok"


class FrameValidator:
    """Per-session validator. Holds the orientation hysteresis counters.

    One instance per session; ``reset()`` drops all state.
    """

    __slots__ = (
        "_exercise",
        "_bad_orientation_streak",
        "_good_orientation_streak",
        "_orientation_flagged",
        "_people",
    )

    def __init__(self, exercise: ExerciseDefinition) -> None:
        self._exercise = exercise
        self._bad_orientation_streak = 0
        self._good_orientation_streak = 0
        self._orientation_flagged = False
        self._people = MultiPersonGate()

    def validate(
        self,
        lms: Optional[PoseLandmarks],
        side: str,
        person_count: Optional[int] = None,
    ) -> ValidationOutcome:
        """Run all four checks against one frame.

        ``person_count`` is how many poses the estimator found in this frame
        (``None`` if it cannot count — the check is then skipped).

        ``lms`` is ``None`` when MediaPipe found no pose at all, which is
        reported as ``body_not_fully_visible`` (the closest user-actionable
        reason: get in frame) with ``detail="no_pose_detected"``.
        """
        failures: Dict[str, Optional[str]] = {}
        orientation_dict: Dict[str, float] = {}
        min_visibility: Optional[float] = None

        if self._people.update(person_count):
            failures["multiple_people_detected"] = f"pose_count={person_count}"

        if lms is None:
            failures["body_not_fully_visible"] = "no_pose_detected"
            return self._pick(failures, orientation_dict, min_visibility)

        missing = _missing_body_groups(lms)
        if missing:
            failures["body_not_fully_visible"] = "missing:" + ",".join(missing)

        key_joints = self._exercise.key_joints(side)
        min_visibility = lms.min_visibility(key_joints)
        if min_visibility < MIN_KEY_JOINT_VISIBILITY:
            failures["low_confidence"] = (
                f"min_key_joint_visibility={min_visibility:.2f}"
                f"<{MIN_KEY_JOINT_VISIBILITY}"
            )

        orientation = check_orientation(lms)
        orientation_dict = orientation.as_dict()
        if self._update_orientation_hysteresis(orientation.is_side_on):
            failures["wrong_orientation_needs_side_view"] = orientation.reason or "front_on"

        return self._pick(failures, orientation_dict, min_visibility)

    def _update_orientation_hysteresis(self, is_side_on: bool) -> bool:
        """Advance the streak counters; return True while the flag is raised.

        Hysteresis keeps a single noisy frame from telling the user to
        reposition, and keeps one lucky frame from clearing a genuine
        front-on setup.
        """
        if is_side_on:
            self._good_orientation_streak += 1
            self._bad_orientation_streak = 0
            if (
                self._orientation_flagged
                and self._good_orientation_streak >= ORIENTATION_GOOD_FRAMES_TO_CLEAR
            ):
                self._orientation_flagged = False
        else:
            self._bad_orientation_streak += 1
            self._good_orientation_streak = 0
            if self._bad_orientation_streak >= ORIENTATION_BAD_FRAMES_TO_FLAG:
                self._orientation_flagged = True
        return self._orientation_flagged

    @staticmethod
    def _pick(
        failures: Dict[str, Optional[str]],
        orientation: Dict[str, float],
        min_visibility: Optional[float],
    ) -> ValidationOutcome:
        """Report the highest-priority failure, per VALIDATION_PRIORITY."""
        for status in VALIDATION_PRIORITY:
            if status in failures:
                return ValidationOutcome(
                    status=status,
                    detail=failures[status],
                    orientation=orientation,
                    min_key_joint_visibility=min_visibility,
                )
        return ValidationOutcome(
            status="ok",
            detail=None,
            orientation=orientation,
            min_key_joint_visibility=min_visibility,
        )

    def reset(self) -> None:
        self._bad_orientation_streak = 0
        self._good_orientation_streak = 0
        self._orientation_flagged = False
        self._people.reset()


def _missing_body_groups(lms: PoseLandmarks) -> list[str]:
    """Body regions with no landmark inside the frame.

    Checked per region rather than per landmark because in a side-on view the
    far-side limbs are legitimately hidden behind the near ones; what matters is
    that the region is in shot at all. Visibility is deliberately NOT considered
    here — a well-framed but poorly tracked joint is a ``low_confidence`` frame,
    and reporting it as a framing problem would send the user to fix the wrong
    thing.
    """
    missing: list[str] = []
    for group_name, group in FULL_BODY_GROUPS.items():
        if not any(_present(lms, lm) for lm in group):
            missing.append(group_name)
    return missing


def _present(lms: PoseLandmarks, lm: LM) -> bool:
    """Whether this landmark lies inside the frame (within tolerance)."""
    x, y = lms.raw_xy(lm)
    low = -FRAME_BOUNDS_TOLERANCE
    high = 1.0 + FRAME_BOUNDS_TOLERANCE
    return low <= x <= high and low <= y <= high


def _round(value: float, decimals: int = 4) -> float:
    return float("nan") if math.isnan(value) else round(value, decimals)

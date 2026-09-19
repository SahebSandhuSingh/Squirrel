"""Push-up rules.

CAMERA ANGLE ASSUMPTION (enforced, not assumed — see pose_backend.validation)
---------------------------------------------------------------------------
SIDE-ON view: the user's side faces the camera, whole body in frame, camera
roughly at torso height and level with the floor. A side view is required
because both measured quantities are only meaningful in the sagittal plane:

  * elbow bend (shoulder-elbow-wrist) — front-on, the forearm points at the
    camera and the projected angle collapses, so depth cannot be judged;
  * body alignment (shoulder-hip-ankle) — sagging or piked hips are a
    deviation in the sagittal plane and are invisible front-on.

Frames whose orientation check says "front-on" never reach these rules.

ANGLES MEASURED (only these two)
--------------------------------
  elbow_angle_deg      : shoulder-elbow-wrist, vertex = elbow.
                         ~180 = arms locked out (top), smaller = deeper bend.
  body_line_angle_deg  : shoulder-hip-ankle,   vertex = hip.
                         ~180 = straight plank line; lower = sagging or piked.

CLASSIFICATION SIGNALS (rule-based, tunable in pose_backend.config)
-------------------------------------------------------------------
  torso_horizontal       : shoulder->hip line is near the image horizontal.
                           This is the discriminator against arm curls.
  body_line_straightish  : deliberately LOOSE band on body_line_angle_deg —
                           enough to tell "in a plank" from "standing", not a
                           form judgement. Form grading is a later step and
                           must not turn a sloppy push-up into "unrecognized".
  wrist_below_shoulder   : hands are planted on the floor, so the wrist sits
                           below the shoulder in image space. Cheap sanity
                           check that separates a push-up from, say, lying down.
"""

from __future__ import annotations

from typing import Dict, Mapping, Tuple

from ..config import (
    PUSHUP_BODY_LINE_MIN_DEG,
    PUSHUP_MIN_WRIST_BELOW_SHOULDER,
    PUSHUP_SIGNAL_WEIGHTS,
    PUSHUP_TORSO_MAX_DEG_FROM_HORIZONTAL,
    SIGNAL_SOFT_MARGIN_DEG,
)
from ..geometry import angle_at, ramp_above, ramp_below
from ..landmarks import LM, SIDE_JOINTS, PoseLandmarks
from .base import ExerciseDefinition, check_weights, torso_angle_from_horizontal_deg

__all__ = ["PushUp", "PUSHUP"]

#: Normalised-y slack for the wrist-below-shoulder test, expressed as a ramp
#: width rather than a hard edge (the ramp helpers take degrees elsewhere; this
#: one is in normalised image units, hence its own local margin).
_WRIST_RAMP_MARGIN = 0.04

check_weights("pushup", PUSHUP_SIGNAL_WEIGHTS)


class PushUp(ExerciseDefinition):
    key = "pushup"
    display_name = "Push-ups"
    CAMERA_VIEW_ASSUMPTION = (
        "Side-on view: turn your side to the camera so your whole body is in "
        "frame from head to feet. Needed to judge elbow bend and body alignment."
    )
    weights = PUSHUP_SIGNAL_WEIGHTS

    def key_joints(self, side: str) -> Tuple[LM, ...]:
        """Ankle included: the body-line angle needs it, so low ankle confidence
        must gate the frame rather than silently produce a bogus body line."""
        j = SIDE_JOINTS[side]
        return (j["shoulder"], j["elbow"], j["wrist"], j["hip"], j["ankle"])

    def compute_angles(self, lms: PoseLandmarks, side: str) -> Dict[str, float]:
        j = lms.side_joints(side)
        shoulder = lms.point(j["shoulder"])
        elbow = lms.point(j["elbow"])
        wrist = lms.point(j["wrist"])
        hip = lms.point(j["hip"])
        ankle = lms.point(j["ankle"])
        return {
            "elbow_angle_deg": angle_at(shoulder, elbow, wrist),
            "body_line_angle_deg": angle_at(shoulder, hip, ankle),
        }

    def signals(
        self, lms: PoseLandmarks, side: str, angles: Mapping[str, float]
    ) -> Dict[str, float]:
        j = lms.side_joints(side)
        # Image space (y grows downward): positive delta = wrist lower than shoulder.
        wrist_below = lms.raw_xy(j["wrist"])[1] - lms.raw_xy(j["shoulder"])[1]
        return {
            "torso_horizontal": ramp_below(
                torso_angle_from_horizontal_deg(lms),
                PUSHUP_TORSO_MAX_DEG_FROM_HORIZONTAL,
                SIGNAL_SOFT_MARGIN_DEG,
            ),
            "body_line_straightish": ramp_above(
                angles.get("body_line_angle_deg", float("nan")),
                PUSHUP_BODY_LINE_MIN_DEG,
                SIGNAL_SOFT_MARGIN_DEG,
            ),
            "wrist_below_shoulder": ramp_above(
                wrist_below, PUSHUP_MIN_WRIST_BELOW_SHOULDER, _WRIST_RAMP_MARGIN
            ),
        }


#: Module singleton — exercises are stateless rule sets.
PUSHUP = PushUp()

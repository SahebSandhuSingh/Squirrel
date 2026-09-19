"""Arm-curl (biceps curl) rules.

CAMERA ANGLE ASSUMPTION (enforced, not assumed — see pose_backend.validation)
---------------------------------------------------------------------------
SIDE-ON view: the user stands with their side to the camera, whole body in
frame, camera roughly at chest height. The app explicitly instructs the user to
turn to their side before starting. A side view is required because:

  * elbow bend (shoulder-elbow-wrist) is only cleanly measurable in the
    sagittal plane — front-on, the forearm swings toward the camera and the
    projected angle barely changes through a full curl;
  * elbow drift away from the torso (the usual momentum/cheating cue) is a
    forward/backward deviation, which front-on is hidden behind the torso.

Frames whose orientation check says "front-on" never reach these rules.

ANGLES MEASURED (only these two)
--------------------------------
  elbow_angle_deg        : shoulder-elbow-wrist, vertex = elbow. PRIMARY signal.
                           ~170 = arm extended (bottom), ~30 = fully curled.
  elbow_drift_angle_deg  : shoulder-hip-elbow,   vertex = hip.
                           Small = elbow stays tucked against the torso;
                           growing = elbow drifting forward/away (momentum).

CLASSIFICATION SIGNALS (rule-based, tunable in pose_backend.config)
-------------------------------------------------------------------
  torso_upright              : shoulder->hip line is near the image vertical.
                               This is the discriminator against push-ups.
  elbow_tucked_to_torso      : elbow_drift_angle_deg within the tucked band.
                               Loose enough that a moderately drifting elbow is
                               still recognised as a curl (drift is form
                               feedback for a later step, not identity).
  elbow_angle_in_curl_range  : elbow bend inside the plausible curl window —
                               rejects a straight-armed standing pose, which
                               otherwise satisfies "upright + tucked".
"""

from __future__ import annotations

from typing import Dict, Mapping, Tuple

from ..config import (
    ARM_CURL_ELBOW_ANGLE_MAX_DEG,
    ARM_CURL_ELBOW_ANGLE_MIN_DEG,
    ARM_CURL_ELBOW_DRIFT_MAX_DEG,
    ARM_CURL_SIGNAL_WEIGHTS,
    ARM_CURL_TORSO_MIN_DEG_FROM_HORIZONTAL,
    SIGNAL_SOFT_MARGIN_DEG,
)
from ..geometry import angle_at, ramp_above, ramp_below, ramp_within
from ..landmarks import LM, SIDE_JOINTS, PoseLandmarks
from .base import ExerciseDefinition, check_weights, torso_angle_from_horizontal_deg

__all__ = ["ArmCurl", "ARM_CURL"]

check_weights("arm_curl", ARM_CURL_SIGNAL_WEIGHTS)


class ArmCurl(ExerciseDefinition):
    key = "arm_curl"
    display_name = "Arm curls"
    CAMERA_VIEW_ASSUMPTION = (
        "Side-on view: turn to your side so the camera sees your profile, with "
        "your whole body in frame. Needed to judge elbow bend clearly."
    )
    weights = ARM_CURL_SIGNAL_WEIGHTS

    def key_joints(self, side: str) -> Tuple[LM, ...]:
        """No ankle/knee: neither measured angle uses the legs, so a partly
        occluded lower body must not block a curl frame."""
        j = SIDE_JOINTS[side]
        return (j["shoulder"], j["elbow"], j["wrist"], j["hip"])

    def compute_angles(self, lms: PoseLandmarks, side: str) -> Dict[str, float]:
        j = lms.side_joints(side)
        shoulder = lms.point(j["shoulder"])
        elbow = lms.point(j["elbow"])
        wrist = lms.point(j["wrist"])
        hip = lms.point(j["hip"])
        return {
            "elbow_angle_deg": angle_at(shoulder, elbow, wrist),
            # Vertex = hip: how far the elbow sits off the shoulder-hip (torso) line.
            "elbow_drift_angle_deg": angle_at(shoulder, hip, elbow),
        }

    def signals(
        self, lms: PoseLandmarks, side: str, angles: Mapping[str, float]
    ) -> Dict[str, float]:
        return {
            "torso_upright": ramp_above(
                torso_angle_from_horizontal_deg(lms),
                ARM_CURL_TORSO_MIN_DEG_FROM_HORIZONTAL,
                SIGNAL_SOFT_MARGIN_DEG,
            ),
            "elbow_tucked_to_torso": ramp_below(
                angles.get("elbow_drift_angle_deg", float("nan")),
                ARM_CURL_ELBOW_DRIFT_MAX_DEG,
                SIGNAL_SOFT_MARGIN_DEG,
            ),
            "elbow_angle_in_curl_range": ramp_within(
                angles.get("elbow_angle_deg", float("nan")),
                ARM_CURL_ELBOW_ANGLE_MIN_DEG,
                ARM_CURL_ELBOW_ANGLE_MAX_DEG,
                SIGNAL_SOFT_MARGIN_DEG,
            ),
        }


#: Module singleton — exercises are stateless rule sets.
ARM_CURL = ArmCurl()

"""Synthetic 33-landmark poses for tests that need no video, model or socket.

These are hand-placed skeletons in a SQUARE frame (aspect 1.0, so x and y read
directly as the geometry they describe) for the two exercises, seen side-on,
plus the failure cases validation must catch.

They deliberately encode the camera assumption the real pipeline enforces: the
near-side limb chain carries high visibility, and the far side sits a couple of
normalised units away in x — which is exactly what a side-on view looks like to
BlazePose, and what makes the shoulder/hip spread ratios small.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

import numpy as np

from pose_backend.landmarks import LANDMARK_COUNT, LM, PoseLandmarks

Point = Tuple[float, float]

#: Visibility for the camera-facing side, and for the partly occluded far side.
NEAR_VISIBILITY = 0.95
FAR_VISIBILITY = 0.65


def build_pose(
    *,
    nose: Point,
    shoulder: Point,
    elbow: Point,
    wrist: Point,
    hip: Point,
    knee: Point,
    ankle: Point,
    lateral_offset: float = 0.02,
    near_visibility: float = NEAR_VISIBILITY,
    far_visibility: float = FAR_VISIBILITY,
    overrides: Optional[Dict[LM, Tuple[float, float, float]]] = None,
    size: int = 1000,
) -> PoseLandmarks:
    """Build a full 33-landmark pose from one side's joint chain.

    ``lateral_offset`` is how far the far-side joints sit from the near-side
    ones in x: small = side-on view, large = front-on view. This single knob is
    what the orientation check keys on.

    ``overrides`` sets exact ``(x, y, visibility)`` for specific landmarks, for
    cases like "ankle out of frame" or "wrist confidence collapsed".
    """
    array = np.zeros((LANDMARK_COUNT, 4), dtype=np.float32)

    def place(landmark: LM, point: Point, visibility: float) -> None:
        array[int(landmark)] = (point[0], point[1], 0.0, visibility)

    def shifted(point: Point) -> Point:
        return (point[0] + lateral_offset, point[1])

    # Head: nose is enough for the "head" body group; ears help nothing else here.
    place(LM.NOSE, nose, near_visibility)
    place(LM.LEFT_EAR, nose, near_visibility)
    place(LM.RIGHT_EAR, shifted(nose), far_visibility)

    near = {
        LM.LEFT_SHOULDER: shoulder,
        LM.LEFT_ELBOW: elbow,
        LM.LEFT_WRIST: wrist,
        LM.LEFT_HIP: hip,
        LM.LEFT_KNEE: knee,
        LM.LEFT_ANKLE: ankle,
    }
    far = {
        LM.RIGHT_SHOULDER: shoulder,
        LM.RIGHT_ELBOW: elbow,
        LM.RIGHT_WRIST: wrist,
        LM.RIGHT_HIP: hip,
        LM.RIGHT_KNEE: knee,
        LM.RIGHT_ANKLE: ankle,
    }
    for landmark, point in near.items():
        place(landmark, point, near_visibility)
    for landmark, point in far.items():
        place(landmark, shifted(point), far_visibility)

    # Extremities nothing in this step measures, kept plausible and low-confidence.
    for landmark, source in (
        (LM.LEFT_INDEX, wrist),
        (LM.LEFT_PINKY, wrist),
        (LM.LEFT_THUMB, wrist),
        (LM.LEFT_HEEL, ankle),
        (LM.LEFT_FOOT_INDEX, ankle),
    ):
        place(landmark, source, 0.4)

    for landmark, (x, y, visibility) in (overrides or {}).items():
        array[int(landmark)] = (x, y, 0.0, visibility)

    return PoseLandmarks(array, size, size)


# ---------------------------------------------------------------------------
# Push-ups, side-on. Body roughly horizontal, hands planted below the shoulders.
# ---------------------------------------------------------------------------


def pushup_top(**kwargs) -> PoseLandmarks:
    """Arms locked out at the top of a push-up (elbow ~180 deg)."""
    return build_pose(
        nose=(0.28, 0.58),
        shoulder=(0.35, 0.60),
        elbow=(0.345, 0.70),
        wrist=(0.34, 0.80),
        hip=(0.57, 0.62),
        knee=(0.70, 0.63),
        ankle=(0.82, 0.64),
        **kwargs,
    )


def pushup_bottom(**kwargs) -> PoseLandmarks:
    """Chest down, elbow clearly bent (~70 deg), body still a straight line."""
    return build_pose(
        nose=(0.28, 0.68),
        shoulder=(0.35, 0.70),
        elbow=(0.45, 0.775),
        wrist=(0.34, 0.85),
        hip=(0.57, 0.72),
        knee=(0.70, 0.73),
        ankle=(0.82, 0.74),
        **kwargs,
    )


def pushup_sagging_hips(**kwargs) -> PoseLandmarks:
    """Hips dropped — bad form, but still unmistakably a push-up.

    Exists to pin the behaviour that form quality is NOT identity: this frame
    must still classify as a push-up at this step (form grading comes later).
    """
    return build_pose(
        nose=(0.28, 0.58),
        shoulder=(0.35, 0.60),
        elbow=(0.345, 0.70),
        wrist=(0.34, 0.80),
        hip=(0.57, 0.74),
        knee=(0.70, 0.66),
        ankle=(0.82, 0.64),
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Arm curls, side-on. Torso vertical, elbow tucked against the torso.
# ---------------------------------------------------------------------------


def arm_curl_extended(**kwargs) -> PoseLandmarks:
    """Bottom of a curl: arm hanging nearly straight (elbow ~170 deg)."""
    return build_pose(
        nose=(0.50, 0.20),
        shoulder=(0.50, 0.30),
        elbow=(0.50, 0.45),
        wrist=(0.52, 0.60),
        hip=(0.50, 0.55),
        knee=(0.50, 0.75),
        ankle=(0.50, 0.92),
        **kwargs,
    )


def arm_curl_flexed(**kwargs) -> PoseLandmarks:
    """Top of a curl: forearm raised, elbow still pinned to the torso (~27 deg)."""
    return build_pose(
        nose=(0.50, 0.20),
        shoulder=(0.50, 0.30),
        elbow=(0.50, 0.45),
        wrist=(0.56, 0.33),
        hip=(0.50, 0.55),
        knee=(0.50, 0.75),
        ankle=(0.50, 0.92),
        **kwargs,
    )


def arm_curl_elbow_drifted(**kwargs) -> PoseLandmarks:
    """Elbow swung forward away from the torso — the momentum/cheat cue."""
    return build_pose(
        nose=(0.50, 0.20),
        shoulder=(0.50, 0.30),
        elbow=(0.62, 0.45),
        wrist=(0.66, 0.33),
        hip=(0.50, 0.55),
        knee=(0.50, 0.75),
        ankle=(0.50, 0.92),
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Failure cases the validator must catch.
# ---------------------------------------------------------------------------


def front_on_standing(**kwargs) -> PoseLandmarks:
    """Standing, but facing the camera: shoulders and hips spread wide in x."""
    return arm_curl_flexed(lateral_offset=0.20, far_visibility=0.9, **kwargs)


def standing_neutral(**kwargs) -> PoseLandmarks:
    """Side-on standing at rest — neither exercise in progress.

    Useful for pinning what a single frame CAN and cannot tell apart: with the
    arm hanging straight this is geometrically identical to the bottom of a curl.
    """
    return arm_curl_extended(**kwargs)


def low_confidence_pose(**kwargs) -> PoseLandmarks:
    """A well-posed side-on curl whose arm joints lost tracking confidence."""
    pose = arm_curl_flexed(**kwargs)
    for landmark in (LM.LEFT_ELBOW, LM.LEFT_WRIST):
        pose.array[int(landmark)][3] = 0.30
    for landmark in (LM.RIGHT_ELBOW, LM.RIGHT_WRIST):
        pose.array[int(landmark)][3] = 0.25
    return pose


def cropped_feet_pose(**kwargs) -> PoseLandmarks:
    """Camera too close: both ankles fall outside the frame."""
    pose = arm_curl_flexed(**kwargs)
    for landmark in (LM.LEFT_ANKLE, LM.RIGHT_ANKLE):
        pose.array[int(landmark)][1] = 1.25
    return pose


def jpeg_like_frame(width: int = 640, height: int = 480) -> np.ndarray:
    """A plain BGR frame, for tests that only need *a* decodable image."""
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = (40, 60, 80)
    return frame

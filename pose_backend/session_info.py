"""The handshake payload: what the app is told when a session opens.

Split out of session.py so the thresholds the client mirrors (camera
instruction, confidence gates, frame-rate target) have one obvious source and
can be asserted in tests without standing up a socket.
"""

from __future__ import annotations

from typing import Dict

from .config import (
    CLASSIFICATION_MIN_SCORE,
    FRAME_QUEUE_MAX_SIZE,
    MIN_KEY_JOINT_VISIBILITY,
    SIDE_VIEW_HIP_SPREAD_MAX_RATIO,
    SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO,
    SMOOTHING_WINDOW_FRAMES,
    TARGET_MIN_FPS,
    UNRECOGNIZED_FRAME_LIMIT,
)
from .exercises import get_exercise
from .schemas import SessionReady

__all__ = ["client_visible_config", "session_ready_message"]


def client_visible_config() -> Dict[str, float]:
    """Thresholds the app should mirror, so both sides agree on the rules."""
    return {
        "target_min_fps": TARGET_MIN_FPS,
        "min_key_joint_visibility": MIN_KEY_JOINT_VISIBILITY,
        "classification_min_score": CLASSIFICATION_MIN_SCORE,
        "unrecognized_frame_limit": float(UNRECOGNIZED_FRAME_LIMIT),
        "frame_queue_max_size": float(FRAME_QUEUE_MAX_SIZE),
        "smoothing_window_frames": float(SMOOTHING_WINDOW_FRAMES),
        "side_view_shoulder_spread_max_ratio": SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO,
        "side_view_hip_spread_max_ratio": SIDE_VIEW_HIP_SPREAD_MAX_RATIO,
    }


def session_ready_message(session_id: str, exercise: str) -> dict:
    """Build the ``session_ready`` payload for a newly opened session."""
    definition = get_exercise(exercise)
    return SessionReady(
        session_id=session_id,
        exercise=exercise,  # type: ignore[arg-type]
        required_camera_view=definition.CAMERA_VIEW_ASSUMPTION,
        config=client_visible_config(),
    ).model_dump()

"""Protocol-level validation for incoming pose frames."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from numbers import Real
from typing import Mapping

from backend.core.landmarks import ALL_LANDMARKS

_LANDMARK_NAMES = frozenset(ALL_LANDMARKS)


class FrameValidationError(ValueError):
    """An incoming message is not a safe pose-analysis frame."""


@dataclass(frozen=True)
class TrainingFrame:
    t_ms: float
    keypoints: dict[str, dict[str, float]]


def validate_training_frame(
    payload: object,
    *,
    previous_t_ms: float | None,
) -> TrainingFrame:
    """Validate finite monotonic time and known, bounded landmark records.

    Missing landmarks are valid tracking unavailability; malformed supplied landmarks are not.
    This distinction lets an adapter pause safely without accepting corrupt numeric input.
    """
    if not isinstance(payload, Mapping):
        raise FrameValidationError("frame must be a mapping")
    timestamp = _finite(payload.get("t_ms"), "t_ms")
    if previous_t_ms is not None and timestamp < previous_t_ms:
        raise FrameValidationError("t_ms must be monotonic")

    raw_keypoints = payload.get("keypoints")
    if not isinstance(raw_keypoints, Mapping):
        raise FrameValidationError("keypoints must be a mapping")

    keypoints: dict[str, dict[str, float]] = {}
    for name, raw_landmark in raw_keypoints.items():
        if not isinstance(name, str) or name not in _LANDMARK_NAMES:
            raise FrameValidationError(f"unknown landmark: {name!r}")
        if not isinstance(raw_landmark, Mapping):
            raise FrameValidationError(f"landmark '{name}' must be a mapping")
        x = _finite(raw_landmark.get("x"), f"landmark '{name}'.x")
        y = _finite(raw_landmark.get("y"), f"landmark '{name}'.y")
        visibility = _finite(raw_landmark.get("v"), f"landmark '{name}'.v")
        if not 0 <= visibility <= 1:
            raise FrameValidationError(f"landmark '{name}'.v must be within [0, 1]")
        landmark = {"x": x, "y": y, "v": visibility}
        if "z" in raw_landmark:
            landmark["z"] = _finite(raw_landmark.get("z"), f"landmark '{name}'.z")
        keypoints[name] = landmark
    return TrainingFrame(timestamp, keypoints)


def _finite(value: object, name: str) -> float:
    if not isinstance(value, Real) or isinstance(value, bool):
        raise FrameValidationError(f"{name} must be numeric")
    result = float(value)
    if not isfinite(result):
        raise FrameValidationError(f"{name} must be finite")
    return result

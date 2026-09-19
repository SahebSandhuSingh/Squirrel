"""Shared scaffolding for the per-exercise rule modules.

An exercise module declares three things and nothing else:
    1. its CAMERA VIEW ASSUMPTION (documented constant, not folklore),
    2. the joint angles that matter for it (only those — not all 33 landmarks),
    3. the rule signals that decide whether a frame looks like that exercise.

Classification stays rule-based and explainable: each signal is a named,
individually weighted, soft-thresholded test over a measured angle, and the
per-signal satisfactions are returned so a frame's verdict can always be
explained by the numbers that produced it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Mapping, Tuple

from ..geometry import angle_from_horizontal, weighted_score
from ..landmarks import LM, PoseLandmarks

__all__ = [
    "ExerciseEvaluation",
    "ExerciseDefinition",
    "torso_angle_from_horizontal_deg",
    "check_weights",
]


def torso_angle_from_horizontal_deg(lms: PoseLandmarks) -> float:
    """Angle of the shoulder-midpoint -> hip-midpoint line vs image horizontal.

    This is the primary discriminator between the two exercises (it is the
    body's orientation relative to gravity, as seen side-on):

        ~0-35 deg   torso lying flat        -> push-up posture
        ~60-90 deg  torso upright/standing  -> arm-curl posture

    Uses the midpoint of both shoulders and both hips, so it does not depend on
    which side of the body faces the camera.
    """
    shoulder_mid = lms.mid_point(LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER)
    hip_mid = lms.mid_point(LM.LEFT_HIP, LM.RIGHT_HIP)
    return angle_from_horizontal(shoulder_mid, hip_mid)


def check_weights(exercise: str, weights: Mapping[str, float]) -> None:
    """Fail fast at import time if a tuned weight set no longer sums to 1.0."""
    total = sum(weights.values())
    if abs(total - 1.0) > 1e-6:
        raise ValueError(
            f"{exercise}: signal weights must sum to 1.0, got {total:.4f} "
            f"({dict(weights)})"
        )


@dataclass(frozen=True)
class ExerciseEvaluation:
    """Outcome of running one exercise's rules against one frame."""

    exercise: str
    #: Only this exercise's relevant angles, in degrees.
    angles: Dict[str, float] = field(default_factory=dict)
    #: signal name -> satisfaction in [0, 1].
    signals: Dict[str, float] = field(default_factory=dict)
    #: Weighted combination of ``signals``, in [0, 1].
    score: float = 0.0
    #: Body side the limb angles were read from.
    side: str = "left"
    #: Shared discriminator, surfaced for logging/tuning.
    torso_angle_from_horizontal_deg: float = float("nan")


class ExerciseDefinition(ABC):
    """Base class for a rule-based exercise definition."""

    #: Stable wire key, as used in ``FrameResult.detected_exercise``.
    key: str = ""
    display_name: str = ""
    #: Human-readable camera requirement, sent to the app on session start.
    CAMERA_VIEW_ASSUMPTION: str = ""
    #: signal name -> weight; must sum to 1.0 (enforced by ``check_weights``).
    weights: Mapping[str, float] = {}

    @abstractmethod
    def key_joints(self, side: str) -> Tuple[LM, ...]:
        """Landmarks whose confidence gates this exercise's angle computation."""

    @abstractmethod
    def compute_angles(self, lms: PoseLandmarks, side: str) -> Dict[str, float]:
        """Compute ONLY this exercise's relevant joint angles (degrees)."""

    @abstractmethod
    def signals(
        self, lms: PoseLandmarks, side: str, angles: Mapping[str, float]
    ) -> Dict[str, float]:
        """Per-signal satisfaction in [0, 1] for this frame."""

    def evaluate(self, lms: PoseLandmarks, side: str | None = None) -> ExerciseEvaluation:
        """Run angles + signals + weighted score for one frame."""
        side = side or lms.best_side()
        angles = self.compute_angles(lms, side)
        signals = self.signals(lms, side, angles)
        score = weighted_score(
            [(signals.get(name, 0.0), weight) for name, weight in self.weights.items()]
        )
        return ExerciseEvaluation(
            exercise=self.key,
            angles=angles,
            signals=signals,
            score=score,
            side=side,
            torso_angle_from_horizontal_deg=torso_angle_from_horizontal_deg(lms),
        )

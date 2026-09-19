"""Rule-based exercise classification (no ML model, by design).

Every verdict here is a weighted sum of named, soft-thresholded tests over
measured joint angles, all of which are returned alongside the verdict. That
makes a misclassification debuggable ("torso_horizontal scored 0.2 because the
torso read 48 degrees off horizontal") and tunable by editing one constant in
config.py — which a trained classifier would not be at this stage.

Session contract: the mobile app sends the exercise the user selected when the
session opens. The backend TRUSTS that selection and validates consistency
against it — it confirms the selected exercise or reports "unrecognized"; it
never silently switches the user to the other exercise. The other exercise's
score is still computed and returned under ``scores_by_exercise``, because when
a user picks the wrong exercise (or the app's UI state drifts) that number is
what shows it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from .config import CLASSIFICATION_MIN_SCORE, UNRECOGNIZED_FRAME_LIMIT
from .exercises import EXERCISES, get_exercise
from .landmarks import PoseLandmarks

__all__ = ["ClassificationResult", "ExerciseClassifier"]


@dataclass(frozen=True)
class ClassificationResult:
    """One frame's classification, with the evidence that produced it."""

    #: "pushup" | "arm_curl" | "unrecognized".
    detected_exercise: str
    #: Weighted rule score in [0, 1] for the SELECTED exercise. When the verdict
    #: is "unrecognized" this is the sub-threshold score, not zero — it says how
    #: close the frame came, which is what threshold tuning needs.
    confidence: float
    #: Only the selected exercise's relevant angles (degrees).
    angles: Dict[str, float] = field(default_factory=dict)
    #: Per-signal satisfaction in [0, 1] for the selected exercise.
    signals: Dict[str, float] = field(default_factory=dict)
    #: Score of every registered exercise, for diagnostics.
    scores_by_exercise: Dict[str, float] = field(default_factory=dict)
    side: str = "left"
    torso_angle_from_horizontal_deg: float = float("nan")
    #: Why it was unrecognized, e.g. "weak:torso_horizontal". None when recognized.
    reason: Optional[str] = None


class ExerciseClassifier:
    """Per-session classifier. Owns the consecutive-"unrecognized" streak.

    One instance per session; ``reset()`` drops all state so nothing survives a
    disconnect.
    """

    __slots__ = ("_selected", "_selected_key", "_streak")

    def __init__(self, selected_exercise: str) -> None:
        self._selected = get_exercise(selected_exercise)
        self._selected_key = selected_exercise
        self._streak = 0

    @property
    def selected_exercise(self) -> str:
        return self._selected_key

    @property
    def unrecognized_streak(self) -> int:
        """Consecutive frames classified as "unrecognized"."""
        return self._streak

    @property
    def needs_reposition_or_reselect(self) -> bool:
        """True once the streak reaches ``UNRECOGNIZED_FRAME_LIMIT``.

        The session reports this to the app immediately on the frame that
        crosses the limit, and keeps reporting it until a frame is recognised
        again — either the user repositions, or they re-select the exercise.
        """
        return self._streak >= UNRECOGNIZED_FRAME_LIMIT

    def classify(self, lms: PoseLandmarks) -> ClassificationResult:
        """Classify one VALIDATED frame (side-on view already confirmed)."""
        side = lms.best_side()
        evaluations = {key: ex.evaluate(lms, side) for key, ex in EXERCISES.items()}
        selected = evaluations[self._selected_key]
        scores = {key: round(ev.score, 4) for key, ev in evaluations.items()}

        recognised = selected.score >= CLASSIFICATION_MIN_SCORE
        if recognised:
            self._streak = 0
            reason = None
        else:
            self._streak += 1
            reason = _weakest_signal(selected.signals)

        return ClassificationResult(
            detected_exercise=self._selected_key if recognised else "unrecognized",
            confidence=round(selected.score, 4),
            angles={k: _round_angle(v) for k, v in selected.angles.items()},
            signals={k: round(v, 4) for k, v in selected.signals.items()},
            scores_by_exercise=scores,
            side=side,
            torso_angle_from_horizontal_deg=_round_angle(
                selected.torso_angle_from_horizontal_deg
            ),
            reason=reason,
        )

    def note_unclassified_frame(self) -> None:
        """Record a frame that failed validation and so was never classified.

        The streak is deliberately FROZEN rather than incremented or reset: a
        frame the pipeline refused to classify (low confidence, body out of
        frame, front-on camera) is not evidence for or against the selected
        exercise, and it already reports its own validation status to the app.
        """

    def reset(self) -> None:
        self._streak = 0


def _weakest_signal(signals: Dict[str, float]) -> Optional[str]:
    """Name the signal that held the score down — the tuning starting point."""
    if not signals:
        return "no_signals"
    name = min(signals, key=lambda key: signals[key])
    return f"weak:{name}"


def _round_angle(value: float, decimals: int = 2) -> float:
    return round(float(value), decimals)

"""Registry of the exercises this step supports.

Step 1 monitors exactly two exercises, both requiring a SIDE-ON camera view.
Adding a third means adding a module here and registering it — nothing else in
the pipeline needs to change.
"""

from __future__ import annotations

from typing import Dict

from .arm_curl import ARM_CURL, ArmCurl
from .base import ExerciseDefinition, ExerciseEvaluation, torso_angle_from_horizontal_deg
from .pushup import PUSHUP, PushUp

__all__ = [
    "ARM_CURL",
    "PUSHUP",
    "ArmCurl",
    "PushUp",
    "ExerciseDefinition",
    "ExerciseEvaluation",
    "EXERCISES",
    "get_exercise",
    "torso_angle_from_horizontal_deg",
]

#: wire key -> rule set. Every exercise here requires a side-on view.
EXERCISES: Dict[str, ExerciseDefinition] = {
    PUSHUP.key: PUSHUP,
    ARM_CURL.key: ARM_CURL,
}


def get_exercise(key: str) -> ExerciseDefinition:
    """Look up an exercise rule set by wire key, raising a clear error."""
    try:
        return EXERCISES[key]
    except KeyError:
        raise KeyError(
            f"unknown exercise {key!r}; supported: {sorted(EXERCISES)}"
        ) from None

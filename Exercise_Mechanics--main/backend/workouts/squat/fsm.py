"""Squat phase vocabulary over the exercise-agnostic rep FSM.

The state machine itself lives in ``backend.engine.rep_fsm``; it derives every lifecycle role from
the configured transition graph. This module only pins the squat phase names its adapter references
and exposes ``SquatFSM`` as the historical alias.
"""

from __future__ import annotations

from backend.engine.rep_fsm import (
    AttemptClassification,
    AttemptResult,
    RepFSM,
    RepState,
    fsm_diagnostics,
)

# Squat descend-first phase vocabulary. The generic FSM never hard-codes these; the squat adapter
# references SETUP/DESCENT to detect the setup→descent boundary for its shallow-depth cue.
SETUP, DESCENT, BOTTOM, ASCENT, RESET = "setup", "descent", "bottom", "ascent", "reset"

SquatFSM = RepFSM

__all__ = [
    "AttemptClassification",
    "AttemptResult",
    "RepFSM",
    "RepState",
    "SquatFSM",
    "fsm_diagnostics",
    "SETUP",
    "DESCENT",
    "BOTTOM",
    "ASCENT",
    "RESET",
]

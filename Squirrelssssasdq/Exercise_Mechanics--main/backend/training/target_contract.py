"""Strict persisted movement-target contracts shared by future router branches.

Phase 0 defines these shapes without changing the enabled repetition-only runtime. Existing
sessions retain ``{"type": "reps", "value": N}``; timed sessions use the deliberately distinct
``{"type": "time", "value_ms": N}`` shape so units cannot be guessed at a call site.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Union


class MovementTargetError(ValueError):
    """A persisted session target is incomplete, ambiguous, or invalid."""


@dataclass(frozen=True)
class RepTarget:
    type: Literal["reps"]
    value: int


@dataclass(frozen=True)
class TimeTarget:
    type: Literal["time"]
    value_ms: int


MovementTarget = Union[RepTarget, TimeTarget]


def parse_movement_target(raw: object) -> MovementTarget:
    """Parse one exact persisted target shape without coercion or default units."""
    if not isinstance(raw, dict):
        raise MovementTargetError("session target must be a mapping")
    target_type = raw.get("type")
    if target_type == "reps":
        if set(raw) != {"type", "value"}:
            raise MovementTargetError("repetition target must define exactly type and value")
        return RepTarget("reps", _positive_integer(raw.get("value"), "target.value"))
    if target_type == "time":
        if set(raw) != {"type", "value_ms"}:
            raise MovementTargetError("timed target must define exactly type and value_ms")
        return TimeTarget("time", _positive_integer(raw.get("value_ms"), "target.value_ms"))
    raise MovementTargetError("session target type must be 'reps' or 'time'")


def target_document(target: MovementTarget) -> dict[str, int | str]:
    """Return the canonical JSON-ready representation of a parsed target."""
    if isinstance(target, RepTarget):
        return {"type": "reps", "value": target.value}
    if isinstance(target, TimeTarget):
        return {"type": "time", "value_ms": target.value_ms}
    raise TypeError("target must be a RepTarget or TimeTarget")


def _positive_integer(value: object, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise MovementTargetError(f"{name} must be a positive integer")
    return value

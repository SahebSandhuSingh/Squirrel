"""Executable Phase 0 contracts for cyclic timed exercises.

This module defines pure values and invariants only. It does not start a timer, build an adapter,
write capture artifacts, or make a planned exercise available. Phase 1 will wire these contracts
through the runtime.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isclose, isfinite
from numbers import Real
from typing import Literal, Sequence


class TimedContractError(ValueError):
    """A timed status or scoring input violates the locked Phase 0 contract."""


LiftSide = Literal["left", "right"]
LiftClassification = Literal["invalid", "shallow", "full_rom"]
TimedScoreQuality = Literal["not_performed", "unavailable", "low_confidence", "reliable"]


@dataclass(frozen=True)
class LiftThresholds:
    reset: float
    movement_start: float
    min_lift_peak: float
    full_rom_gate: float

    def __post_init__(self) -> None:
        values = tuple(
            _finite(value, name)
            for name, value in (
                ("reset", self.reset),
                ("movement_start", self.movement_start),
                ("min_lift_peak", self.min_lift_peak),
                ("full_rom_gate", self.full_rom_gate),
            )
        )
        if not 0 <= values[0] < values[1] < values[2] < values[3]:
            raise TimedContractError(
                "lift thresholds must satisfy "
                "0 <= reset < movement_start < min_lift_peak < full_rom_gate"
            )

    def classify(self, peak: object) -> LiftClassification:
        value = _finite(peak, "peak")
        if value < self.min_lift_peak:
            return "invalid"
        if value < self.full_rom_gate:
            return "shallow"
        return "full_rom"


@dataclass(frozen=True)
class LiftCycleEvent:
    lift_id: int
    side: LiftSide
    classification: LiftClassification
    peak_progress: float
    started_t_ms: float
    completed_t_ms: float

    def __post_init__(self) -> None:
        _positive_integer(self.lift_id, "lift_id")
        if self.side not in {"left", "right"}:
            raise TimedContractError("lift side must be 'left' or 'right'")
        if self.classification not in {"invalid", "shallow", "full_rom"}:
            raise TimedContractError("lift classification is invalid")
        peak = _finite(self.peak_progress, "peak_progress")
        started = _finite(self.started_t_ms, "started_t_ms")
        completed = _finite(self.completed_t_ms, "completed_t_ms")
        if peak < 0:
            raise TimedContractError("peak_progress must be non-negative")
        if started < 0 or completed < started:
            raise TimedContractError("lift timestamps must be non-negative and monotonic")

    @property
    def counted(self) -> bool:
        return self.classification in {"shallow", "full_rom"}


@dataclass(frozen=True)
class TimedMovementCounters:
    detected_cycles: int
    counted_lifts: int
    full_lifts: int
    shallow_lifts: int
    invalid_lifts: int
    left_lifts: int
    right_lifts: int

    def __post_init__(self) -> None:
        for name, value in self.__dict__.items():
            _nonnegative_integer(value, name)
        if self.detected_cycles != self.counted_lifts + self.invalid_lifts:
            raise TimedContractError(
                "detected_cycles must equal counted_lifts plus invalid_lifts"
            )
        if self.counted_lifts != self.full_lifts + self.shallow_lifts:
            raise TimedContractError("counted_lifts must equal full_lifts plus shallow_lifts")
        if self.counted_lifts != self.left_lifts + self.right_lifts:
            raise TimedContractError("counted_lifts must equal left_lifts plus right_lifts")


@dataclass(frozen=True)
class TimedSetStatus:
    target_duration_ms: int
    elapsed_ms: float
    remaining_ms: float
    complete: bool

    def __post_init__(self) -> None:
        target = _positive_integer(self.target_duration_ms, "target_duration_ms")
        elapsed = _finite(self.elapsed_ms, "elapsed_ms")
        remaining = _finite(self.remaining_ms, "remaining_ms")
        if elapsed < 0 or elapsed > target:
            raise TimedContractError("elapsed_ms must lie between zero and target_duration_ms")
        if remaining < 0 or remaining > target:
            raise TimedContractError("remaining_ms must lie between zero and target_duration_ms")
        expected_remaining = max(0.0, target - elapsed)
        if not isclose(remaining, expected_remaining, rel_tol=0.0, abs_tol=1e-6):
            raise TimedContractError("remaining_ms must equal target_duration_ms minus elapsed_ms")
        if not isinstance(self.complete, bool):
            raise TimedContractError("complete must be boolean")
        if self.complete != isclose(elapsed, float(target), rel_tol=0.0, abs_tol=1e-6):
            raise TimedContractError("complete must agree with elapsed timed-set progress")

    def document(self) -> dict[str, int | float | bool | str]:
        return {
            "movement_type": "time",
            "target_duration_ms": self.target_duration_ms,
            "elapsed_ms": self.elapsed_ms,
            "remaining_ms": self.remaining_ms,
            "complete": self.complete,
        }


@dataclass(frozen=True)
class TimedFrameEvents:
    lift_cycles: tuple[LiftCycleEvent, ...]
    set_completed: bool

    def __post_init__(self) -> None:
        if not isinstance(self.lift_cycles, tuple) or any(
            not isinstance(event, LiftCycleEvent) for event in self.lift_cycles
        ):
            raise TimedContractError("lift_cycles must be a tuple of LiftCycleEvent values")
        ids = [event.lift_id for event in self.lift_cycles]
        if len(ids) != len(set(ids)):
            raise TimedContractError("lift cycle ids must be unique within one frame")
        if not isinstance(self.set_completed, bool):
            raise TimedContractError("set_completed must be boolean")


@dataclass(frozen=True)
class TimedCoreStatus:
    set: TimedSetStatus
    movement: TimedMovementCounters
    events: TimedFrameEvents

    def __post_init__(self) -> None:
        if not isinstance(self.set, TimedSetStatus):
            raise TimedContractError("set must be TimedSetStatus")
        if not isinstance(self.movement, TimedMovementCounters):
            raise TimedContractError("movement must be TimedMovementCounters")
        if not isinstance(self.events, TimedFrameEvents):
            raise TimedContractError("events must be TimedFrameEvents")
        if self.events.set_completed and not self.set.complete:
            raise TimedContractError("set_completed cannot occur before timed set completion")


@dataclass(frozen=True)
class TimedSetScore:
    score: float | None
    rom_factor: float | None
    form_factor: float | None
    penalty: float | None
    quality: TimedScoreQuality


def score_timed_cyclic_set(
    peaks: Sequence[object],
    *,
    full_rom_gate: object,
    rom_floor: object,
    rule_penalties: Sequence[object] = (),
    rom_available: bool = True,
    coverage_reliable: bool = True,
) -> TimedSetScore:
    """Reference calculation that locks the future High Knee set-scorer behavior."""
    gate = _finite(full_rom_gate, "full_rom_gate")
    floor = _finite(rom_floor, "rom_floor")
    if gate <= 0:
        raise TimedContractError("full_rom_gate must be positive")
    if not 0 <= floor <= 1:
        raise TimedContractError("rom_floor must lie between zero and one")
    if not isinstance(rom_available, bool) or not isinstance(coverage_reliable, bool):
        raise TimedContractError("score availability flags must be boolean")
    normalized_peaks = tuple(_finite(value, "peak") for value in peaks)
    if any(value < 0 for value in normalized_peaks):
        raise TimedContractError("peaks must be non-negative")
    penalties = tuple(_finite(value, "rule_penalty") for value in rule_penalties)
    if any(not 0 <= value <= 1 for value in penalties):
        raise TimedContractError("rule penalties must lie between zero and one")
    if not normalized_peaks:
        return TimedSetScore(None, None, None, None, "not_performed")
    if not rom_available:
        return TimedSetScore(None, None, None, None, "unavailable")

    factors = tuple(min(1.0, max(floor, peak / gate)) for peak in normalized_peaks)
    rom_factor = sum(factors) / len(factors)
    penalty = min(1.0, sum(penalties))
    form_factor = 1.0 - penalty
    score = round(100.0 * rom_factor * form_factor, 1)
    return TimedSetScore(
        score,
        round(rom_factor, 6),
        round(form_factor, 6),
        round(penalty, 6),
        "reliable" if coverage_reliable else "low_confidence",
    )


def _finite(value: object, name: str) -> float:
    if not isinstance(value, Real) or isinstance(value, bool):
        raise TimedContractError(f"{name} must be numeric")
    result = float(value)
    if not isfinite(result):
        raise TimedContractError(f"{name} must be finite")
    return result


def _positive_integer(value: object, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise TimedContractError(f"{name} must be a positive integer")
    return value


def _nonnegative_integer(value: object, name: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise TimedContractError(f"{name} must be a non-negative integer")
    return value

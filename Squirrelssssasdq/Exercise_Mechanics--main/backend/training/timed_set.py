"""Monotonic accepted-frame clock for duration-target training sets."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from numbers import Real

from backend.training.timed_contract import TimedSetStatus


@dataclass(frozen=True)
class TimedSetUpdate:
    status: TimedSetStatus
    set_completed: bool


class TimedSetTimer:
    """Start on the first accepted frame and emit completion exactly once."""

    def __init__(self, target_duration_ms: int) -> None:
        if (
            not isinstance(target_duration_ms, int)
            or isinstance(target_duration_ms, bool)
            or target_duration_ms < 1
        ):
            raise ValueError("target_duration_ms must be a positive integer")
        self._target_duration_ms = target_duration_ms
        self._started_t_ms: float | None = None
        self._previous_t_ms: float | None = None
        self._complete = False

    @property
    def target_duration_ms(self) -> int:
        return self._target_duration_ms

    def update(self, t_ms: object) -> TimedSetUpdate:
        if not isinstance(t_ms, Real) or isinstance(t_ms, bool):
            raise ValueError("t_ms must be numeric")
        now = float(t_ms)
        if not isfinite(now) or now < 0:
            raise ValueError("t_ms must be finite and non-negative")
        if self._previous_t_ms is not None and now < self._previous_t_ms:
            raise ValueError("timed-set timestamps must be monotonic")
        self._previous_t_ms = now
        if self._started_t_ms is None:
            self._started_t_ms = now

        elapsed = min(float(self._target_duration_ms), now - self._started_t_ms)
        completed_now = not self._complete and elapsed >= self._target_duration_ms
        self._complete = self._complete or completed_now
        status = TimedSetStatus(
            self._target_duration_ms,
            elapsed,
            max(0.0, self._target_duration_ms - elapsed),
            self._complete,
        )
        return TimedSetUpdate(status, completed_now)

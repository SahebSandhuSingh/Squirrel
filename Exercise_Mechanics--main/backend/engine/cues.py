"""Priority-aware cue selection with configuration-supplied display durations."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from numbers import Real


@dataclass(frozen=True)
class CueCandidate:
    rule_id: str
    text: str
    rank: int
    display_ms: float | None = None
    # Full trainer-voiced coaching for the post-set report (distinct from the terse live `text`).
    coaching: str | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.rule_id, str) or not self.rule_id.strip():
            raise ValueError("cue rule_id must be non-empty")
        if not isinstance(self.text, str) or not self.text.strip():
            raise ValueError("cue text must be non-empty")
        if self.coaching is not None and not isinstance(self.coaching, str):
            raise ValueError("cue coaching must be a string when provided")
        if not isinstance(self.rank, int) or isinstance(self.rank, bool) or self.rank < 1:
            raise ValueError("cue rank must be a positive integer")
        if self.display_ms is not None:
            if not isinstance(self.display_ms, Real) or isinstance(self.display_ms, bool):
                raise ValueError("cue display_ms must be numeric")
            duration = float(self.display_ms)
            if not isfinite(duration) or duration < 0:
                raise ValueError("cue display_ms must be finite and non-negative")


class CueSelector:
    """Hold each cue for its configured duration with higher-priority preemption."""

    def __init__(self, *, min_display_ms: float) -> None:
        if not isinstance(min_display_ms, Real) or isinstance(min_display_ms, bool):
            raise ValueError("min_display_ms must be numeric")
        duration = float(min_display_ms)
        if not isfinite(duration) or duration < 0:
            raise ValueError("min_display_ms must be finite and non-negative")
        self._min_display_ms = duration
        self._current: CueCandidate | None = None
        self._shown_at_ms: float | None = None

    def select(self, candidates: list[CueCandidate], now_ms: float) -> CueCandidate | None:
        timestamp = float(now_ms)
        ordered = sorted(candidates, key=lambda candidate: (candidate.rank, candidate.rule_id))
        best = ordered[0] if ordered else None

        if self._current is None:
            self._replace(best, timestamp)
            return self._current
        if best is not None and best.rank < self._current.rank:
            self._replace(best, timestamp)
            return self._current
        if any(candidate.rule_id == self._current.rule_id for candidate in ordered):
            return self._current

        shown_at = self._shown_at_ms if self._shown_at_ms is not None else timestamp
        display_ms = (
            self._min_display_ms
            if self._current.display_ms is None
            else float(self._current.display_ms)
        )
        if timestamp - shown_at < display_ms:
            return self._current
        self._replace(best, timestamp)
        return self._current

    def _replace(self, candidate: CueCandidate | None, timestamp: float) -> None:
        self._current = candidate
        self._shown_at_ms = timestamp if candidate is not None else None

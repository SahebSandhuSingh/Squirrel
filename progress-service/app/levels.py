"""The single level calculator. Every level shown anywhere comes from `level_info`.

LEVEL_CURVE:
  linear:<n>                 every level needs n more XP (the app has always used 2000)
  thresholds:0,1000,2500,... XP needed to *reach* level 1, 2, 3, …; past the last one, the
                             final gap repeats.
"""

from __future__ import annotations

from bisect import bisect_right
from functools import lru_cache

from app.config import settings


@lru_cache(maxsize=8)
def _curve(spec: str) -> tuple[str, tuple[int, ...]]:
    kind, _, raw = spec.partition(":")
    if kind == "linear":
        step = int(raw)
        if step <= 0:
            raise ValueError("linear level step must be positive")
        return "linear", (step,)
    if kind == "thresholds":
        values = tuple(int(v) for v in raw.split(","))
        if len(values) < 2 or values[0] != 0 or any(b <= a for a, b in zip(values, values[1:])):
            raise ValueError("thresholds must start at 0 and strictly increase")
        return "thresholds", values
    raise ValueError(f"unknown LEVEL_CURVE: {spec}")


def level_bounds(total_xp: int, spec: str | None = None) -> tuple[int, int, int]:
    """(level, xp needed to reach this level, xp needed to reach the next)."""
    kind, v = _curve(spec or settings.level_curve)
    xp = max(0, int(total_xp))
    if kind == "linear":
        step = v[0]
        level = xp // step + 1
        return level, (level - 1) * step, level * step
    idx = bisect_right(v, xp)  # thresholds[idx-1] <= xp < thresholds[idx]
    if idx < len(v):
        return idx, v[idx - 1], v[idx]
    gap = v[-1] - v[-2]
    extra = (xp - v[-1]) // gap
    level = len(v) + extra
    lo = v[-1] + extra * gap
    return level, lo, lo + gap


def calculate_level(total_xp: int) -> int:
    return level_bounds(total_xp)[0]


def get_xp_for_next_level(total_xp: int) -> int:
    return level_bounds(total_xp)[2]


def level_info(total_xp: int) -> dict:
    level, lo, hi = level_bounds(total_xp)
    return {
        "level": level,
        "currentXP": int(total_xp),
        "xpForCurrentLevel": lo,
        "xpForNextLevel": hi,
        "progress": round((total_xp - lo) / (hi - lo), 4) if hi > lo else 0.0,
    }

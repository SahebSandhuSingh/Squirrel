"""Distribution summaries shared by offline signal analyzers (a generic primitive, not a rule).

Replay analysis answers "what did this signal actually do across the capture" — the input to every
threshold decision in this project. The arithmetic is identical whatever the signal is, so it lives
here once rather than being copied into each exercise's analyzer, where the copies would drift and
two exercises' reports would stop being comparable.

Nothing here classifies. These functions describe a distribution; deciding what a number means is
the rule kernel's job, and deciding what it should be is the tuner's.
"""

from __future__ import annotations

import math
import statistics

# Analyzer output is read by humans and diffed between captures; six decimals keeps pixel-derived
# ratios exact enough to compare without pretending to precision the pose model does not have.
_PRECISION = 6


def rounded(value: float | None) -> float | None:
    """Round for report output, passing None (an unavailable reading) straight through."""
    return None if value is None else round(float(value), _PRECISION)


def percentile(ordered: list[float], fraction: float) -> float:
    """Linear-interpolated percentile of an ALREADY SORTED list.

    Sorting is the caller's responsibility because a caller summarising several percentiles of the
    same signal should sort once."""
    if not ordered:
        raise ValueError("percentile requires at least one value")
    if len(ordered) == 1:
        return ordered[0]
    position = fraction * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def describe(values: list[float]) -> dict | None:
    """Full distribution summary of one signal, or None when nothing was measurable.

    The percentile spread (not just min/max) is what makes a threshold defensible: p95/p99 show
    whether an extreme is the movement or a single bad frame."""
    if not values:
        return None
    ordered = sorted(float(value) for value in values)
    return {
        "min": rounded(ordered[0]),
        "p05": rounded(percentile(ordered, 0.05)),
        "median": rounded(statistics.median(ordered)),
        "p95": rounded(percentile(ordered, 0.95)),
        "p99": rounded(percentile(ordered, 0.99)),
        "max": rounded(ordered[-1]),
        "mean": rounded(statistics.fmean(ordered)),
        "stddev": rounded(statistics.pstdev(ordered)),
    }

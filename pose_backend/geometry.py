"""Pure geometry helpers. No MediaPipe, no OpenCV, no I/O.

Everything here is a plain function over (x, y) tuples so it can be unit
tested with synthetic input (see tests/test_geometry.py).

Coordinate convention (matches the image, NOT school maths):
    x grows to the RIGHT, y grows DOWNWARD.
Inputs are expected in aspect-corrected space (x already multiplied by
width / height) so angles are not skewed by the frame's aspect ratio.
"""

from __future__ import annotations

import math
from typing import Sequence, Tuple

Point = Tuple[float, float]

__all__ = [
    "Point",
    "distance",
    "midpoint",
    "angle_at",
    "angle_from_horizontal",
    "ramp_below",
    "ramp_above",
    "ramp_within",
]


def distance(a: Point, b: Point) -> float:
    """Euclidean distance between two points."""
    return math.hypot(b[0] - a[0], b[1] - a[1])


def midpoint(a: Point, b: Point) -> Point:
    """Midpoint of two points (e.g. shoulder midpoint, hip midpoint)."""
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)


def angle_at(a: Point, b: Point, c: Point) -> float:
    """Interior angle at joint ``b`` formed by ``a-b-c``, in degrees [0, 180].

    This is the joint-angle primitive for every exercise: e.g.
    ``angle_at(shoulder, elbow, wrist)`` is the elbow bend, where 180 degrees
    is a fully straight arm and small values are a deep bend.

    Returns ``float('nan')`` if ``a`` or ``c`` coincides with ``b`` (the angle
    is undefined). Callers treat NaN as "angle unavailable" rather than 0.
    """
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n1 = math.hypot(*v1)
    n2 = math.hypot(*v2)
    if n1 == 0.0 or n2 == 0.0:
        return float("nan")
    cos_theta = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)
    # Guard float drift outside the valid domain of acos.
    cos_theta = max(-1.0, min(1.0, cos_theta))
    return math.degrees(math.acos(cos_theta))


def angle_from_horizontal(a: Point, b: Point) -> float:
    """Angle of segment ``a-b`` against the image horizontal, in [0, 90].

    0 degrees  = perfectly horizontal segment (push-up torso, lying down)
    90 degrees = perfectly vertical segment   (arm-curl torso, standing)

    Direction-agnostic on purpose: it must not matter whether the user faces
    camera-left or camera-right, nor which end of the segment is passed first.
    Returns NaN for a degenerate (zero-length) segment.
    """
    dx = abs(b[0] - a[0])
    dy = abs(b[1] - a[1])
    if dx == 0.0 and dy == 0.0:
        return float("nan")
    return math.degrees(math.atan2(dy, dx))


# ---------------------------------------------------------------------------
# Soft-threshold ("ramp") helpers used by the rule-based classifier.
#
# A hard boolean at a threshold makes classification flicker exactly where a
# rep spends most of its time. These return a graded satisfaction in [0, 1]:
# 1.0 well inside the band, 0.0 well outside, linear across ``margin``.
# ---------------------------------------------------------------------------


def ramp_below(value: float, limit: float, margin: float) -> float:
    """1.0 when ``value <= limit``, decaying to 0.0 at ``limit + margin``."""
    if math.isnan(value):
        return 0.0
    if margin <= 0.0:
        return 1.0 if value <= limit else 0.0
    if value <= limit:
        return 1.0
    if value >= limit + margin:
        return 0.0
    return (limit + margin - value) / margin


def ramp_above(value: float, limit: float, margin: float) -> float:
    """1.0 when ``value >= limit``, decaying to 0.0 at ``limit - margin``."""
    if math.isnan(value):
        return 0.0
    if margin <= 0.0:
        return 1.0 if value >= limit else 0.0
    if value >= limit:
        return 1.0
    if value <= limit - margin:
        return 0.0
    return (value - (limit - margin)) / margin


def ramp_within(value: float, low: float, high: float, margin: float) -> float:
    """1.0 inside ``[low, high]``, decaying to 0.0 ``margin`` outside either end."""
    if math.isnan(value):
        return 0.0
    return min(ramp_above(value, low, margin), ramp_below(value, high, margin))


def weighted_score(parts: Sequence[Tuple[float, float]]) -> float:
    """Combine ``(satisfaction, weight)`` pairs into a score in [0, 1]."""
    total_weight = sum(w for _, w in parts)
    if total_weight <= 0.0:
        return 0.0
    return sum(s * w for s, w in parts) / total_weight

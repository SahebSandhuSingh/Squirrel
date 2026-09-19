"""Validated, exhaustive numeric range classification from configuration."""

from __future__ import annotations

from dataclasses import dataclass
from math import inf, isfinite
from numbers import Real
from typing import Mapping, Sequence


class RangePolicyError(ValueError):
    """A configured range table is malformed, overlapping or incomplete."""


@dataclass(frozen=True)
class ClassifiedRange:
    lower: float | None
    lower_inclusive: bool
    upper: float | None
    upper_inclusive: bool
    state: str
    skeleton_color: str
    side: str | None = None

    def contains(self, value: float) -> bool:
        lower_ok = self.lower is None or (
            value >= self.lower if self.lower_inclusive else value > self.lower
        )
        upper_ok = self.upper is None or (
            value <= self.upper if self.upper_inclusive else value < self.upper
        )
        return lower_ok and upper_ok


class NumericRangePolicy:
    """Compile ordered YAML ranges into one exhaustive numeric classifier."""

    def __init__(self, entries: object) -> None:
        if not isinstance(entries, Sequence) or isinstance(entries, (str, bytes)) or not entries:
            raise RangePolicyError("ranges must be a non-empty list")
        self._ranges = tuple(
            _compile_entry(entry, index)
            for index, entry in enumerate(entries)
        )
        _validate_coverage(self._ranges)

    @property
    def ranges(self) -> tuple[ClassifiedRange, ...]:
        return self._ranges

    def classify(self, value: object) -> ClassifiedRange:
        number = _finite_number(value, "range value")
        matches = tuple(entry for entry in self._ranges if entry.contains(number))
        if len(matches) != 1:
            raise RuntimeError(f"configured ranges matched {len(matches)} times for {number}")
        return matches[0]


def _compile_entry(value: object, index: int) -> ClassifiedRange:
    context = f"ranges[{index}]"
    if not isinstance(value, Mapping):
        raise RangePolicyError(f"{context} must be a mapping")
    required = {"range", "state", "skeleton_color"}
    allowed_fields = required | {"side"}
    if not required <= set(value) or not set(value) <= allowed_fields:
        raise RangePolicyError(
            f"{context} must contain range, state and skeleton_color, with optional side"
        )
    raw_range = value["range"]
    if not isinstance(raw_range, Mapping) or not raw_range:
        raise RangePolicyError(f"{context}.range must be a non-empty mapping")
    allowed = {"gt", "gte", "lt", "lte"}
    unknown = set(raw_range) - allowed
    if unknown:
        raise RangePolicyError(f"{context}.range has unsupported operators: {sorted(unknown)}")
    lower_keys = set(raw_range) & {"gt", "gte"}
    upper_keys = set(raw_range) & {"lt", "lte"}
    if len(lower_keys) > 1 or len(upper_keys) > 1:
        raise RangePolicyError(f"{context}.range cannot repeat a lower or upper boundary")
    if not lower_keys and not upper_keys:
        raise RangePolicyError(f"{context}.range must define a boundary")

    lower_key = next(iter(lower_keys), None)
    upper_key = next(iter(upper_keys), None)
    lower = None if lower_key is None else _finite_number(raw_range[lower_key], f"{context}.range.{lower_key}")
    upper = None if upper_key is None else _finite_number(raw_range[upper_key], f"{context}.range.{upper_key}")
    if lower is not None and upper is not None and not lower < upper:
        raise RangePolicyError(f"{context}.range lower boundary must be below upper boundary")

    state = value["state"]
    color = value["skeleton_color"]
    if not isinstance(state, str) or not state.strip():
        raise RangePolicyError(f"{context}.state must be a non-empty string")
    if not isinstance(color, str) or not color.strip():
        raise RangePolicyError(f"{context}.skeleton_color must be a non-empty string")
    side = value.get("side")
    if side is not None and (not isinstance(side, str) or not side.strip()):
        raise RangePolicyError(f"{context}.side must be a non-empty string or null")
    return ClassifiedRange(
        lower=lower,
        lower_inclusive=lower_key == "gte",
        upper=upper,
        upper_inclusive=upper_key == "lte",
        state=state,
        skeleton_color=color,
        side=side,
    )


def _validate_coverage(ranges: tuple[ClassifiedRange, ...]) -> None:
    if ranges[0].lower is not None:
        raise RangePolicyError("first range must have no lower boundary")
    if ranges[-1].upper is not None:
        raise RangePolicyError("last range must have no upper boundary")

    previous_lower = -inf
    for index, entry in enumerate(ranges):
        current_lower = -inf if entry.lower is None else entry.lower
        if current_lower < previous_lower:
            raise RangePolicyError("ranges must be ordered from lowest to highest")
        previous_lower = current_lower
        if index == 0:
            continue
        previous = ranges[index - 1]
        if previous.upper is None or entry.lower is None or previous.upper != entry.lower:
            raise RangePolicyError(f"ranges[{index - 1}] and ranges[{index}] must share one boundary")
        if previous.upper_inclusive == entry.lower_inclusive:
            relation = "overlap" if previous.upper_inclusive else "leave a gap"
            raise RangePolicyError(f"ranges[{index - 1}] and ranges[{index}] {relation} at their boundary")


def _finite_number(value: object, context: str) -> float:
    if not isinstance(value, Real) or isinstance(value, bool):
        raise RangePolicyError(f"{context} must be numeric")
    result = float(value)
    if not isfinite(result):
        raise RangePolicyError(f"{context} must be finite")
    return result

"""Validated workout catalog with explicit enabled/planned lifecycle state."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Mapping

import yaml

_WORKOUTS_DIR = Path(__file__).resolve().parent
_CATALOG_PATH = _WORKOUTS_DIR / "catalog.yaml"
_SLUG_RE = re.compile(r"^[a-z0-9_]{1,40}$")
_VIEWS = frozenset({"front", "side"})
_STATUSES = frozenset({"enabled", "planned"})
_FIELDS = frozenset({"view", "status"})


class CatalogError(ValueError):
    """The catalog is structurally invalid or advertises a missing enabled implementation."""


@dataclass(frozen=True)
class ExerciseCatalogEntry:
    slug: str
    view: str
    status: str

    @property
    def enabled(self) -> bool:
        return self.status == "enabled"


@dataclass(frozen=True)
class WorkoutCatalog:
    exercises: Mapping[str, ExerciseCatalogEntry]

    def get(self, slug: str) -> ExerciseCatalogEntry | None:
        return self.exercises.get(slug)

    def enabled(self) -> tuple[ExerciseCatalogEntry, ...]:
        return tuple(entry for entry in self.exercises.values() if entry.enabled)


def parse_catalog(path: Path, workouts_dir: Path) -> WorkoutCatalog:
    """Parse and validate a catalog.

    Planned exercises validate lightweight catalog metadata only. Enabled exercises must also
    have an implementation directory, preventing the product from advertising a runnable entry
    that the backend cannot construct.
    """
    try:
        with open(path, encoding="utf-8") as handle:
            raw = yaml.safe_load(handle) or {}
    except OSError as exc:
        raise CatalogError(f"cannot read workout catalog: {path}") from exc
    except yaml.YAMLError as exc:
        raise CatalogError(f"invalid YAML in workout catalog: {path}") from exc

    if not isinstance(raw, dict) or set(raw) != {"exercises"} or not isinstance(raw.get("exercises"), dict):
        raise CatalogError("catalog must contain exactly one 'exercises' mapping")

    entries: dict[str, ExerciseCatalogEntry] = {}
    for slug, value in raw["exercises"].items():
        if not isinstance(slug, str) or not _SLUG_RE.fullmatch(slug):
            raise CatalogError(f"invalid exercise slug: {slug!r}")
        if not isinstance(value, dict):
            raise CatalogError(f"catalog entry '{slug}' must be a mapping")
        unknown = set(value) - _FIELDS
        missing = _FIELDS - set(value)
        if unknown:
            raise CatalogError(f"catalog entry '{slug}' has unknown fields: {sorted(unknown)}")
        if missing:
            raise CatalogError(f"catalog entry '{slug}' is missing fields: {sorted(missing)}")

        view = value["view"]
        status = value["status"]
        if view not in _VIEWS:
            raise CatalogError(f"catalog entry '{slug}' has invalid view: {view!r}")
        if status not in _STATUSES:
            raise CatalogError(f"catalog entry '{slug}' has invalid status: {status!r}")
        if status == "enabled" and not (workouts_dir / slug).is_dir():
            raise CatalogError(f"enabled exercise '{slug}' has no implementation directory")

        entries[slug] = ExerciseCatalogEntry(slug=slug, view=view, status=status)

    if not entries:
        raise CatalogError("catalog must define at least one exercise")
    if not any(entry.enabled for entry in entries.values()):
        raise CatalogError("catalog must enable at least one exercise")
    return WorkoutCatalog(exercises=entries)


@lru_cache(maxsize=1)
def load_catalog() -> WorkoutCatalog:
    """Load the application catalog once. Invalid enabled configuration fails at startup."""
    return parse_catalog(_CATALOG_PATH, _WORKOUTS_DIR)

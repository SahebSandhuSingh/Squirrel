"""Profile-detail persistence, one file per category in the user's directory:

    data/users/<id>/fitness.json       activity level, primary goal (fitness level stays in skill.json)
    data/users/<id>/activities.json    declared activities
    data/users/<id>/physique.json      body type                      (consent: physique)
    data/users/<id>/habits.json        schedule, sleep, diet, …       (consent: habits)
    data/users/<id>/measurements.json  height / weight / body-fat / waist history
    data/users/<id>/consents.json      append-only consent log

Separate files mirror the separate tables in the agreed schema: each sensitive category can be
erased on its own when its consent is withdrawn.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from backend import config

log = logging.getLogger(__name__)

SCHEMA_VERSION = 1
FITNESS_FILENAME = "fitness.json"
ACTIVITIES_FILENAME = "activities.json"
PHYSIQUE_FILENAME = "physique.json"
HABITS_FILENAME = "habits.json"
MEASUREMENTS_FILENAME = "measurements.json"
CONSENTS_FILENAME = "consents.json"

_SECTIONS = {
    "fitness": (FITNESS_FILENAME, dict),
    "activities": (ACTIVITIES_FILENAME, list),
    "physique": (PHYSIQUE_FILENAME, dict),
    "habits": (HABITS_FILENAME, dict),
}


class HistoryUnreadable(RuntimeError):
    """An append-only file (measurements or consents) exists but cannot be read.

    Never treated as empty: appending to it would overwrite the history, and for consents it would
    also mean acting on a consent state we cannot confirm.
    """


def _path(user_id: str, filename: str) -> Path:
    return config.user_dir(user_id) / filename


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- replaceable sections

def read_section(user_id: str, section: str) -> dict | list | None:
    """A saved section, or None when unanswered. A corrupt file reads as unanswered (with a
    warning): the user is simply asked again, and nothing is inferred from half a file."""
    filename, kind = _SECTIONS[section]
    path = _path(user_id, filename)
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            value = json.load(handle)[section]
    except (OSError, ValueError, KeyError, TypeError):
        log.warning("unreadable %s for %s; treating as unanswered", filename, user_id)
        return None
    return value if isinstance(value, kind) else None


def write_section(user_id: str, section: str, value: dict | list) -> None:
    filename, _ = _SECTIONS[section]
    _atomic_write_json(
        _path(user_id, filename),
        {"schema_version": SCHEMA_VERSION, section: value, "updated_at": _now()},
    )


def erase_section(user_id: str, section: str) -> None:
    filename, _ = _SECTIONS[section]
    _path(user_id, filename).unlink(missing_ok=True)


# ---------------------------------------------------------------- append-only histories

def _read_history(user_id: str, filename: str, key: str) -> list[dict]:
    path = _path(user_id, filename)
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as handle:
            items = json.load(handle)[key]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HistoryUnreadable(f"{filename} for {user_id}") from exc
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise HistoryUnreadable(f"{filename} for {user_id}")
    return items


def _write_history(user_id: str, filename: str, key: str, items: list[dict]) -> None:
    _atomic_write_json(_path(user_id, filename), {"schema_version": SCHEMA_VERSION, key: items})


def read_measurements(user_id: str) -> list[dict]:
    return _read_history(user_id, MEASUREMENTS_FILENAME, "measurements")


def write_measurements(user_id: str, measurements: list[dict]) -> None:
    _write_history(user_id, MEASUREMENTS_FILENAME, "measurements", measurements)


def read_consent_events(user_id: str) -> list[dict]:
    return _read_history(user_id, CONSENTS_FILENAME, "events")


def append_consent_event(user_id: str, event: dict) -> list[dict]:
    """Append one event. Raises HistoryUnreadable instead of replacing a log it could not read."""
    events = read_consent_events(user_id) + [event]
    _write_history(user_id, CONSENTS_FILENAME, "events", events)
    return events


def _atomic_write_json(path: Path, payload: dict) -> None:
    """Write-then-rename, so a crash mid-write leaves the previous file rather than half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise

"""Partner Hunt persistence, in the same per-user directory as everything else a user owns.

    data/users/<id>/partner_hunt.json    preferences (what the user asked for)
    data/users/<id>/partner_blocks.json  who the user has blocked

Blocks live apart from preferences so that saving preferences can never clear a block.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from backend import config
from backend.core.ids import is_valid_user_id
from backend.db import accounts as db_accounts
from backend.db import connection

log = logging.getLogger(__name__)

PREFERENCES_FILENAME = "partner_hunt.json"
BLOCKS_FILENAME = "partner_blocks.json"
SCHEMA_VERSION = 1


class BlockListUnreadable(RuntimeError):
    """A block list exists but cannot be read.

    Never treated as "blocks nobody": that would put someone back in front of a person they
    deliberately blocked. Callers must exclude, or refuse, instead.
    """


def read_preferences(user_id: str) -> dict | None:
    """The user's saved preferences, or None when they have none (or the file is unreadable — a
    corrupt file takes the user OFF the board, which is the safe direction)."""
    path = config.user_dir(user_id) / PREFERENCES_FILENAME
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        preferences = document["preferences"]
    except (OSError, ValueError, KeyError, TypeError):
        log.warning("unreadable Partner Hunt preferences for %s; treating as not set", user_id)
        return None
    return preferences if isinstance(preferences, dict) else None


def write_preferences(user_id: str, preferences: dict) -> dict:
    _atomic_write_json(
        config.user_dir(user_id) / PREFERENCES_FILENAME,
        {
            "schema_version": SCHEMA_VERSION,
            "preferences": preferences,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return preferences


def read_blocks(user_id: str) -> frozenset[str]:
    path = config.user_dir(user_id) / BLOCKS_FILENAME
    if not path.exists():
        return frozenset()
    try:
        with open(path, encoding="utf-8") as handle:
            blocked = json.load(handle)["blocked"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise BlockListUnreadable(user_id) from exc
    if not isinstance(blocked, list) or not all(isinstance(item, str) for item in blocked):
        raise BlockListUnreadable(user_id)
    return frozenset(blocked)


def add_block(user_id: str, blocked_user_id: str) -> frozenset[str]:
    """Idempotent. Raises BlockListUnreadable rather than overwriting a list it could not read,
    which would silently lift every earlier block."""
    blocked = read_blocks(user_id) | {blocked_user_id}
    _atomic_write_json(
        config.user_dir(user_id) / BLOCKS_FILENAME,
        {"schema_version": SCHEMA_VERSION, "blocked": sorted(blocked)},
    )
    return blocked


def list_user_ids() -> list[str]:
    """Every user with a profile. Sorted, so anything built from it is deterministic."""
    if connection.enabled():
        return [uid for uid in db_accounts.list_profile_user_ids() if is_valid_user_id(uid)]
    root = config.USERS_DIR
    if not root.exists():
        return []
    return sorted(
        entry.name
        for entry in root.iterdir()
        if entry.is_dir()
        and is_valid_user_id(entry.name)
        and (entry / config.PROFILE_FILENAME).exists()
    )


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

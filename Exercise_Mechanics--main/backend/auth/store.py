"""Credential + refresh-token persistence.

Layout under config.AUTH_DIR (never under version control):
    credentials/<sha256(email)>.json   {user_id, password_hash, created_at}
    refresh/<sha256(token)>.json       {user_id, expires_at}

The email is hashed in the file name so the directory listing is not an address book; the account
profile itself lives in the ordinary users/<id>/profile.json.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from backend import config
from backend.auth.tokens import hash_password, new_refresh_token, token_digest
from backend.config import PROFILE_FILENAME, user_dir


class EmailTaken(Exception):
    pass


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _credential_path(email: str) -> Path:
    return config.AUTH_DIR / "credentials" / f"{hashlib.sha256(normalize_email(email).encode()).hexdigest()}.json"


def _refresh_path(token: str) -> Path:
    return config.AUTH_DIR / "refresh" / f"{token_digest(token)}.json"


def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(payload, f, indent=2)
        os.replace(temp_name, path)
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise


def register_account(email: str, password: str, first_name: str, last_name: str,
                     profile: dict | None = None) -> str:
    """Create the credential and the account's profile. Raises EmailTaken on a duplicate.

    `profile` carries any further sign-up fields (gender, height, date of birth, …), stored in the
    same profile.json. All or nothing: if the profile can't be written, the credential is removed
    so the email can be used again."""
    cred_path = _credential_path(email)
    cred_path.parent.mkdir(parents=True, exist_ok=True)
    # A UUID: the Run Module only accepts UUID subjects, and it is also a valid id here
    # ([a-z0-9-], 36 characters), so the same account works on both backends.
    user_id = str(uuid.uuid4())
    record = {
        "user_id": user_id,
        "password_hash": hash_password(password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # O_EXCL makes the email claim atomic: two concurrent registrations cannot both win.
    try:
        fd = os.open(cred_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise EmailTaken(email) from None
    with os.fdopen(fd, "w") as f:
        json.dump(record, f, indent=2)

    try:
        udir = user_dir(user_id)
        udir.mkdir(parents=True, exist_ok=True)
        _atomic_write_json(udir / PROFILE_FILENAME, {
            **(profile or {}),
            "user_id": user_id,
            "first_name": first_name,
            "last_name": last_name,
            "email": normalize_email(email),
            "created_at": record["created_at"],
        })
    except BaseException:
        cred_path.unlink(missing_ok=True)
        shutil.rmtree(user_dir(user_id), ignore_errors=True)
        raise
    return user_id


def delete_account(email: str, user_id: str) -> None:
    """Undo register_account (used when a later step of sign-up fails)."""
    _credential_path(email).unlink(missing_ok=True)
    shutil.rmtree(user_dir(user_id), ignore_errors=True)


def read_credential(email: str) -> dict | None:
    path = _credential_path(email)
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def issue_refresh_token(user_id: str, now: float | None = None) -> tuple[str, int]:
    token = new_refresh_token()
    expires_at = int((now if now is not None else time.time()) + config.REFRESH_TOKEN_TTL_SECONDS)
    _atomic_write_json(_refresh_path(token), {"user_id": user_id, "expires_at": expires_at})
    return token, expires_at


def consume_refresh_token(token: str, now: float | None = None) -> str | None:
    """Single-use: delete the stored token and return its user id if it was valid."""
    path = _refresh_path(token)
    try:
        with open(path) as f:
            record = json.load(f)
        path.unlink()
    except (FileNotFoundError, ValueError):
        return None
    if record.get("expires_at", 0) <= (now if now is not None else time.time()):
        return None
    return record.get("user_id")

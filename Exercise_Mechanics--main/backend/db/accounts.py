"""Accounts and profiles in PostgreSQL (migration 002). Used instead of the files under data/ whenever
DATABASE_URL is set; auth/store.py, users/store.py and profiles/store.py pick one or the other.

Every function takes and returns the same shapes the file stores did, so nothing above the stores
changes. All SQL is parameterised.
"""

from __future__ import annotations

from datetime import datetime, timezone

import psycopg
from psycopg.types.json import Jsonb

from backend.db.connection import pooled

class EmailTaken(Exception):
    pass


# ---------------------------------------------------------------- accounts

def create_account(user_id: str, email: str, password_hash: str, profile: dict) -> None:
    """The account and its profile in one transaction. Raises EmailTaken on a duplicate email; the
    UNIQUE constraint makes two concurrent sign-ups with one address impossible."""
    try:
        with pooled() as conn, conn.transaction():
            conn.execute("INSERT INTO user_profiles (user_id, profile) VALUES (%s, %s)", (user_id, Jsonb(profile)))
            conn.execute("INSERT INTO user_accounts (user_id, email, password_hash) VALUES (%s, %s, %s)",
                         (user_id, email, password_hash))
    except psycopg.errors.UniqueViolation as exc:
        if exc.diag.constraint_name == "user_accounts_email_key":
            raise EmailTaken(email) from None
        raise


def delete_user(user_id: str) -> None:
    """Remove a user's account, tokens, profile and profile data (undoing a failed sign-up)."""
    with pooled() as conn, conn.transaction():
        conn.execute("DELETE FROM user_profile_data WHERE user_id = %s", (user_id,))
        conn.execute("DELETE FROM user_profiles WHERE user_id = %s", (user_id,))  # cascades to the account


def read_credential(email: str) -> dict | None:
    with pooled() as conn:
        row = conn.execute("SELECT user_id, password_hash, created_at FROM user_accounts WHERE email = %s",
                           (email,)).fetchone()
    if row is None:
        return None
    return {"user_id": row[0], "password_hash": row[1], "created_at": row[2].isoformat()}


def store_refresh_token(digest: str, user_id: str, expires_at: int) -> None:
    with pooled() as conn:
        conn.execute("INSERT INTO user_refresh_tokens (token_sha256, user_id, expires_at) VALUES (%s, %s, %s)",
                     (digest, user_id, datetime.fromtimestamp(expires_at, timezone.utc)))


def consume_refresh_token(digest: str, now: float) -> str | None:
    """Delete the token and return its user id if it had not expired. DELETE … RETURNING makes it
    single-use even when two refreshes race: only one of them gets the row."""
    with pooled() as conn:
        row = conn.execute("DELETE FROM user_refresh_tokens WHERE token_sha256 = %s RETURNING user_id, expires_at",
                           (digest,)).fetchone()
    if row is None or row[1].timestamp() <= now:
        return None
    return row[0]


# ---------------------------------------------------------------- profiles

def read_profile(user_id: str) -> dict | None:
    with pooled() as conn:
        row = conn.execute("SELECT profile FROM user_profiles WHERE user_id = %s", (user_id,)).fetchone()
    return row[0] if row else None


def insert_profile(user_id: str, profile: dict) -> None:
    with pooled() as conn:
        conn.execute("INSERT INTO user_profiles (user_id, profile) VALUES (%s, %s)", (user_id, Jsonb(profile)))


def write_profile(user_id: str, profile: dict) -> None:
    with pooled() as conn:
        conn.execute(
            "INSERT INTO user_profiles (user_id, profile) VALUES (%s, %s) "
            "ON CONFLICT (user_id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = now()",
            (user_id, Jsonb(profile)))


def list_profile_user_ids() -> list[str]:
    with pooled() as conn:
        return [row[0] for row in conn.execute("SELECT user_id FROM user_profiles ORDER BY user_id")]


# ---------------------------------------------------------------- the rest of a profile

def read_data(user_id: str, kind: str) -> dict | None:
    with pooled() as conn:
        row = conn.execute("SELECT data FROM user_profile_data WHERE user_id = %s AND kind = %s",
                           (user_id, kind)).fetchone()
    return row[0] if row else None


def write_data(user_id: str, kind: str, data: dict) -> None:
    with pooled() as conn:
        conn.execute(
            "INSERT INTO user_profile_data (user_id, kind, data) VALUES (%s, %s, %s) "
            "ON CONFLICT (user_id, kind) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
            (user_id, kind, Jsonb(data)))


def delete_data(user_id: str, kind: str) -> None:
    with pooled() as conn:
        conn.execute("DELETE FROM user_profile_data WHERE user_id = %s AND kind = %s", (user_id, kind))


def append_to_list(user_id: str, kind: str, key: str, item: dict, empty: dict) -> dict:
    """Append `item` to the list at `key` in one statement, so two appends can never lose one.
    `empty` is the document to start from when there is none yet. Returns the whole document.

    An existing document whose `key` is not a list is left untouched and returned as it is, so the
    caller's own check reports it as unreadable instead of it being overwritten."""
    with pooled() as conn:
        row = conn.execute(
            "INSERT INTO user_profile_data AS d (user_id, kind, data) VALUES (%(u)s, %(k)s, %(first)s) "
            "ON CONFLICT (user_id, kind) DO UPDATE SET "
            "  data = CASE WHEN jsonb_typeof(d.data -> %(key)s) = 'array' "
            "              THEN jsonb_set(d.data, ARRAY[%(key)s], (d.data -> %(key)s) || %(item)s) "
            "              ELSE d.data END, "
            "  updated_at = now() "
            "RETURNING data",
            {"u": user_id, "k": kind, "key": key, "item": Jsonb([item]),
             "first": Jsonb({**empty, key: [item]})}).fetchone()
    return row[0]

"""Database connection settings."""

from __future__ import annotations

import os

import psycopg

CONNECT_TIMEOUT_S = 3  # a down database must not stall a request or a training socket for long


def database_url() -> str | None:
    """The DATABASE_URL, or None when the database is not configured."""
    url = os.environ.get("DATABASE_URL", "").strip()
    return url or None


def enabled() -> bool:
    return database_url() is not None


def connect() -> psycopg.Connection:
    url = database_url()
    if url is None:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(url, connect_timeout=CONNECT_TIMEOUT_S)

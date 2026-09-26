"""Shared test setup.

Every test runs with sign-in storage in a temporary folder and a fixed signing secret, so no test
can write credentials, refresh tokens or invites into the real data/ directory.

No test ever uses the DATABASE_URL of the shell it runs in: it is removed, so a developer whose
.env points at Supabase cannot write test accounts into it. To run the whole suite with accounts and
profiles in PostgreSQL instead of files, point TEST_ACCOUNTS_DATABASE_URL at a disposable database;
its account and profile tables are emptied before every test.
"""

from __future__ import annotations

import os

import psycopg
import pytest

from backend import config
from backend.auth import throttle

ACCOUNTS_DB_URL = os.environ.get("TEST_ACCOUNTS_DATABASE_URL", "")
_ACCOUNT_TABLES = "user_refresh_tokens, user_accounts, user_profile_data, user_profiles, auth_throttle"


@pytest.fixture(scope="session")
def _accounts_database():
    if not ACCOUNTS_DB_URL:
        yield None
        return
    from backend.db import migrate

    with psycopg.connect(ACCOUNTS_DB_URL) as conn:
        migrate.migrate(conn)
        conn.commit()
    yield ACCOUNTS_DB_URL


@pytest.fixture(autouse=True)
def _isolated_auth_storage(tmp_path_factory, monkeypatch, _accounts_database):
    root = tmp_path_factory.mktemp("auth-data")
    monkeypatch.setattr(config, "AUTH_DIR", root / "auth")
    monkeypatch.setattr(config, "INVITES_DIR", root / "invites")
    monkeypatch.setenv(config.AUTH_SECRET_ENV, "test-signing-secret")
    monkeypatch.delenv(config.REQUIRE_AUTH_ENV, raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    throttle.reset_memory()
    if _accounts_database:
        with psycopg.connect(_accounts_database, autocommit=True) as conn:
            conn.execute(f"TRUNCATE {_ACCOUNT_TABLES}")
        monkeypatch.setenv("DATABASE_URL", _accounts_database)

"""Shared test setup.

Every test runs with sign-in storage in a temporary folder and a fixed signing secret, so no test
can write credentials, refresh tokens or invites into the real data/ directory.
"""

from __future__ import annotations

import pytest

from backend import config


@pytest.fixture(autouse=True)
def _isolated_auth_storage(tmp_path_factory, monkeypatch):
    root = tmp_path_factory.mktemp("auth-data")
    monkeypatch.setattr(config, "AUTH_DIR", root / "auth")
    monkeypatch.setattr(config, "INVITES_DIR", root / "invites")
    monkeypatch.setenv(config.AUTH_SECRET_ENV, "test-signing-secret")
    monkeypatch.delenv(config.REQUIRE_AUTH_ENV, raising=False)

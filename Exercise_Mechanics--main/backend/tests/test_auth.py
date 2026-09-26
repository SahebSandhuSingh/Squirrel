"""Auth REST — register / login / refresh and the bearer dependency."""

from __future__ import annotations

import json

import pytest
from fastapi import Depends, FastAPI

from backend import config
from backend.auth import tokens
from backend.auth.deps import current_user
from backend.auth.router import router as auth_router
from backend.tests.asgi_client import call
from backend.users.store import read_profile

_ACCOUNT = {"email": "Aanya@Example.test", "password": "correct horse", "first_name": "Aanya", "last_name": "Rao"}


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path / "users")
    monkeypatch.setattr(config, "AUTH_DIR", tmp_path / "auth")
    monkeypatch.setenv(config.AUTH_SECRET_ENV, "test-secret")
    app = FastAPI()
    app.include_router(auth_router)

    @app.get("/whoami")
    def whoami(user_id: str = Depends(current_user)) -> dict:
        return {"user_id": user_id}

    return app


def _bearer(token: str) -> dict:
    return {"authorization": f"Bearer {token}"}


def test_register_creates_profile_and_signs_in(app, tmp_path):
    r = call(app, "POST", "/api/auth/register", json=_ACCOUNT)
    assert r.status == 201
    body = r.json()
    profile = read_profile(body["user_id"])
    assert profile["email"] == "aanya@example.test" and profile["first_name"] == "Aanya"
    assert "password" not in json.dumps(profile)
    assert call(app, "GET", "/whoami", headers=_bearer(body["access_token"])).json() == {"user_id": body["user_id"]}
    # the credential index never stores the email or the plaintext password
    [cred] = (tmp_path / "auth" / "credentials").iterdir()
    assert "aanya" not in cred.name and "correct horse" not in cred.read_text()


def test_duplicate_email_is_rejected_case_insensitively(app):
    assert call(app, "POST", "/api/auth/register", json=_ACCOUNT).status == 201
    dup = {**_ACCOUNT, "email": "aanya@EXAMPLE.test"}
    assert call(app, "POST", "/api/auth/register", json=dup).status == 409


def test_login_success_and_failure(app):
    uid = call(app, "POST", "/api/auth/register", json=_ACCOUNT).json()["user_id"]
    ok = call(app, "POST", "/api/auth/login", json={"email": "aanya@example.test", "password": "correct horse"})
    assert ok.status == 200 and ok.json()["user_id"] == uid
    bad = call(app, "POST", "/api/auth/login", json={"email": "aanya@example.test", "password": "wrong password"})
    assert bad.status == 401
    missing = call(app, "POST", "/api/auth/login", json={"email": "nobody@example.test", "password": "x"})
    assert missing.status == 401 and missing.json() == bad.json()


def test_refresh_rotates_and_is_single_use(app):
    first = call(app, "POST", "/api/auth/register", json=_ACCOUNT).json()
    second = call(app, "POST", "/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert second.status == 200 and second.json()["refresh_token"] != first["refresh_token"]
    replay = call(app, "POST", "/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert replay.status == 401


def test_bad_tokens_are_rejected(app):
    body = call(app, "POST", "/api/auth/register", json=_ACCOUNT).json()
    assert call(app, "GET", "/whoami").status == 401
    payload, sig = body["access_token"].split(".")
    forged = tokens._b64e(json.dumps({"sub": "someone-else", "iat": 0, "exp": 9_999_999_999, "typ": "access"}).encode())
    assert call(app, "GET", "/whoami", headers=_bearer(f"{forged}.{sig}")).status == 401
    expired, _ = tokens.issue_access_token(body["user_id"], now=0)
    assert call(app, "GET", "/whoami", headers=_bearer(expired)).status == 401


def test_password_hash_roundtrip():
    h = tokens.hash_password("s3cret-pass")
    assert tokens.verify_password("s3cret-pass", h)
    assert not tokens.verify_password("other", h)
    assert not tokens.verify_password("s3cret-pass", "garbage")

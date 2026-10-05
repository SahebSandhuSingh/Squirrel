"""The separate, four-field access-code signup path."""

from __future__ import annotations

import logging
import re

import psycopg
import pytest
from fastapi import FastAPI

from backend import config, mailer
from backend.auth.router import router as auth_router
from backend.auth.store import read_credential
from backend.db import connection
from backend.tests.asgi_client import call
from backend.users.router import router as users_router
from backend.users.store import read_profile


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path / "users")
    monkeypatch.setenv("SIGNUP_ACCESS_CODE", "731904")
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(users_router)
    return app


def _payload(**overrides):
    return {"email": "john.doe@gmail.com", "full_name": "John Doe", "phone": "+919876543210",
            "access_code": "731904", **overrides}


def _count_accounts() -> int:
    if connection.enabled():
        with psycopg.connect(connection.database_url()) as conn:
            return conn.execute("SELECT count(*) FROM user_accounts").fetchone()[0]
    return len(list((config.AUTH_DIR / "credentials").glob("*.json")))


def test_all_four_fields_create_account_with_normalized_key_and_unverified_phone(app):
    response = call(app, "POST", "/api/auth/signup/access-code", json=_payload())
    assert response.status == 201
    assert _count_accounts() == 1
    assert read_credential("john.doe@gmail.com") == read_credential("johndoe@gmail.com")
    profile = read_profile(response.json()["user_id"])
    assert profile["email"] == "johndoe@gmail.com"
    assert profile["email_as_entered"] == "john.doe@gmail.com"
    assert profile["full_name"] == "John Doe"
    assert profile["phone_number_unverified"] == "+919876543210"
    assert profile["created_at"]


@pytest.mark.parametrize("field", ["email", "full_name", "phone", "access_code"])
def test_each_missing_required_field_is_refused_without_account_row(app, field):
    payload = _payload()
    del payload[field]
    response = call(app, "POST", "/api/auth/signup/access-code", json=payload)
    assert response.status == 422
    assert _count_accounts() == 0


def test_wrong_access_code_is_generic_and_creates_no_account(app):
    response = call(app, "POST", "/api/auth/signup/access-code", json=_payload(access_code="000000"))
    assert response.status == 403
    assert response.json()["detail"] == "Sign-up failed. Check your details and try again."
    assert _count_accounts() == 0


def test_unset_access_code_fails_closed(app, monkeypatch):
    monkeypatch.delenv("SIGNUP_ACCESS_CODE")
    response = call(app, "POST", "/api/auth/signup/access-code", json=_payload())
    assert response.status == 403
    assert response.json()["detail"] == "Sign-up failed. Check your details and try again."
    assert _count_accounts() == 0


def test_gmail_dot_alias_is_one_account_and_duplicate_is_refused(app):
    first = call(app, "POST", "/api/auth/signup/access-code", json=_payload())
    second = call(app, "POST", "/api/auth/signup/access-code", json=_payload(email="johndoe@gmail.com"))
    assert first.status == 201
    assert second.status == 409
    assert read_credential("john.doe@gmail.com")["user_id"] == first.json()["user_id"]
    assert read_credential("johndoe@gmail.com")["user_id"] == first.json()["user_id"]
    assert _count_accounts() == 1


def test_existing_ac_in_email_code_signup_route_still_works(app, monkeypatch):
    sent = []
    monkeypatch.setenv(config.EMAIL_VERIFICATION_ENV, "on")
    monkeypatch.setenv(config.ALLOWED_EMAIL_DOMAINS_ENV, "*")
    monkeypatch.setattr(mailer, "send_email", lambda to, subject, text: sent.append((to, text)))
    response = call(app, "POST", "/api/auth/email/start", json={"email": "student@iiserkol.ac.in"})
    assert response.status == 202
    assert response.json()["new_account"] is True
    assert sent[0][0] == "student@iiserkol.ac.in"
    code = re.search(r"\b(\d{6})\b", sent[0][1]).group(1)
    verified = call(app, "POST", "/api/auth/email/verify", json={
        "email": "student@iiserkol.ac.in", "code": code, "first_name": "Student",
    })
    assert verified.status == 200 and verified.json()["new_account"] is True
    assert _count_accounts() == 1


def test_access_code_signup_rate_limit_is_five_attempts_per_ip(app):
    responses = [call(app, "POST", "/api/auth/signup/access-code", json=_payload(access_code="000000"))
                 for _ in range(6)]
    assert [r.status for r in responses] == [403, 403, 403, 403, 403, 429]
    assert _count_accounts() == 0


def test_access_code_is_absent_from_response_and_logs(app, caplog):
    caplog.set_level(logging.DEBUG)
    response = call(app, "POST", "/api/auth/signup/access-code", json=_payload())
    assert response.status == 201
    rejected = call(app, "POST", "/api/auth/signup/access-code", json=_payload(access_code="000000"))
    assert rejected.status == 403
    assert "731904" not in response.text
    assert "731904" not in rejected.text
    assert "731904" not in caplog.text


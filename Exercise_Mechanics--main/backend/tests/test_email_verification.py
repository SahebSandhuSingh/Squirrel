"""Sign-up email verification: IISER Kolkata addresses only, and a 6-digit emailed code."""

from __future__ import annotations

import base64
import json
import re

import pytest
from fastapi import FastAPI

from backend import config, mailer
from backend.auth import email_codes
from backend.auth.router import router as auth_router
from backend.tests.asgi_client import call
from backend.users.router import router as users_router
from backend.users.store import read_profile

_EMAIL = "aanya.rao21@iiserkol.ac.in"
_ACCOUNT = {"email": _EMAIL, "password": "correct horse", "first_name": "Aanya", "last_name": "Rao"}


@pytest.fixture
def outbox(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(mailer, "send_email", lambda to, subject, text: sent.append(
        {"to": to, "subject": subject, "text": text}))
    return sent


@pytest.fixture
def app(tmp_path, monkeypatch, outbox):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path / "users")
    monkeypatch.setenv(config.EMAIL_VERIFICATION_ENV, "on")
    monkeypatch.delenv(config.ALLOWED_EMAIL_DOMAINS_ENV)
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(users_router)
    return app


def _code(outbox) -> str:
    return re.search(r"\b(\d{6})\b", outbox[-1]["text"]).group(1)


def _claims(token: str) -> dict:
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def test_an_iiser_kolkata_address_gets_a_code_and_signs_up_with_it(app, outbox):
    r = call(app, "POST", "/api/auth/email-code", json={"email": "Aanya.Rao21@IISERKOL.ac.in"})
    assert r.status == 202 and r.json()["expires_in_s"] == 600
    assert outbox[-1]["to"] == _EMAIL
    code = _code(outbox)
    assert code in outbox[-1]["subject"]

    r = call(app, "POST", "/api/auth/register", json={**_ACCOUNT, "code": code})
    assert r.status == 201
    body = r.json()
    assert _claims(body["access_token"])["ev"] is True
    assert read_profile(body["user_id"])["email_verified_at"]
    # a login later still says the address was verified
    login = call(app, "POST", "/api/auth/login", json={"email": _EMAIL, "password": "correct horse"}).json()
    assert _claims(login["access_token"])["ev"] is True


@pytest.mark.parametrize("email", ["someone@gmail.com", "x@iiserkol.ac.in.evil.com", "x@notiiserkol.ac.in"])
def test_other_domains_cannot_sign_up(app, outbox, email):
    assert call(app, "POST", "/api/auth/email-code", json={"email": email}).status == 403
    r = call(app, "POST", "/api/auth/register", json={**_ACCOUNT, "email": email, "code": "123456"})
    assert r.status == 403 and "@iiserkol.ac.in" in r.json()["detail"]
    assert outbox == []


def test_a_subdomain_of_the_institute_is_allowed(app, outbox):
    assert call(app, "POST", "/api/auth/email-code", json={"email": "x@students.iiserkol.ac.in"}).status == 202


def test_register_needs_the_code(app, outbox):
    assert call(app, "POST", "/api/auth/register", json=_ACCOUNT).status == 422
    call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL})
    wrong = "000000" if _code(outbox) != "000000" else "111111"
    assert call(app, "POST", "/api/auth/register", json={**_ACCOUNT, "code": wrong}).status == 400


def test_a_code_is_single_use(app, outbox):
    call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL})
    code = _code(outbox)
    assert call(app, "POST", "/api/auth/register", json={**_ACCOUNT, "code": code}).status == 201
    # the address is taken now; asking for another code says so
    assert call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL}).status == 409


def test_five_wrong_guesses_kill_the_code(app, outbox):
    call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL})
    code = _code(outbox)
    wrong = f"{(int(code) + 1) % 1_000_000:06d}"
    for _ in range(email_codes.MAX_ATTEMPTS):
        assert call(app, "POST", "/api/auth/register", json={**_ACCOUNT, "code": wrong}).status == 400
    assert call(app, "POST", "/api/auth/register", json={**_ACCOUNT, "code": code}).status == 400


def test_an_expired_code_does_not_work(app, outbox):
    email_codes.send_code(_EMAIL, "1.2.3.4", now=0)
    with pytest.raises(email_codes.CodeInvalid):
        email_codes.consume_code(_EMAIL, _code(outbox), now=email_codes.CODE_TTL_S + 1)


def test_codes_cannot_be_requested_back_to_back(app, outbox):
    assert call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL}).status == 202
    again = call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL})
    assert again.status == 429 and "retry-after" in {k.lower() for k in again.headers}


def test_a_new_code_replaces_the_old_one(app, outbox):
    email_codes.send_code(_EMAIL, "1.2.3.4", now=1000)
    first = _code(outbox)
    email_codes.send_code(_EMAIL, "1.2.3.4", now=1000 + email_codes.RESEND_AFTER_S + 1)
    second = _code(outbox)
    if first != second:
        with pytest.raises(email_codes.CodeInvalid):
            email_codes.consume_code(_EMAIL, first, now=1100)
    email_codes.consume_code(_EMAIL, second, now=1100)


def test_a_failed_send_lets_the_person_retry_at_once(app, monkeypatch):
    def fail(to, subject, text):
        raise mailer.EmailNotSent("smtp down")

    monkeypatch.setattr(mailer, "send_email", fail)
    assert call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL}).status == 503
    assert email_codes._read(_EMAIL) is None


def test_the_code_is_not_stored_in_plain_text(app, outbox, tmp_path):
    call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL})
    record = email_codes._read(_EMAIL)
    assert _code(outbox) not in record.code_hmac


def test_the_older_sign_up_route_has_the_same_gate(app, outbox):
    page1 = {"first_name": "Aanya", "last_name": "Rao", "gender": "female", "height_cm": 165, "weight_kg": 55,
             "date_of_birth": "2003-04-05", "mobile": "9999999999", "email": _EMAIL, "password": "correct horse"}
    assert call(app, "POST", "/api/users", json=page1).status == 422
    assert call(app, "POST", "/api/users", json={**page1, "email": "a@gmail.com", "code": "123456"}).status == 403
    call(app, "POST", "/api/auth/email-code", json={"email": _EMAIL})
    r = call(app, "POST", "/api/users", json={**page1, "code": _code(outbox)})
    assert r.status == 200
    assert _claims(r.json()["access_token"])["ev"] is True


def test_accounts_made_without_verification_carry_no_ev_claim(app, monkeypatch):
    monkeypatch.setenv(config.EMAIL_VERIFICATION_ENV, "off")
    r = call(app, "POST", "/api/auth/register", json=_ACCOUNT)
    assert r.status == 201
    assert "ev" not in _claims(r.json()["access_token"])


def test_any_domain_when_the_allow_list_is_a_star(app, monkeypatch, outbox):
    monkeypatch.setenv(config.ALLOWED_EMAIL_DOMAINS_ENV, "*")
    assert call(app, "POST", "/api/auth/email-code", json={"email": "x@gmail.com"}).status == 202

"""Auth REST routes.

  • POST /api/auth/email-code — email a 6-digit sign-up code (auth/email_codes.py).
  • POST /api/auth/register — create an account (email + code + password + name) and sign in.
  • POST /api/auth/login    — exchange email + password for tokens.
  • POST /api/auth/refresh  — rotate a refresh token into a fresh token pair.

All are rate-limited (auth/throttle.py): 429 with Retry-After when over a limit. Sign-up is open to
the allowed email domains only (config.allowed_email_domains: any .ac.in address by default), and needs
the emailed code while config.email_verification_required() is on.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from backend import config, mailer
from backend.auth.store import (
    EmailTaken,
    consume_refresh_token,
    email_verified,
    issue_refresh_token,
    read_credential,
    register_account,
)
from backend.auth import email_codes, throttle
from backend.auth.tokens import burn_password_check, issue_access_token, verify_password

router = APIRouter(prefix="/api/auth")

_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email:      str = Field(min_length=3, max_length=200, pattern=_EMAIL_PATTERN)
    password:   str = Field(min_length=8, max_length=200)
    first_name: str = Field(min_length=1, max_length=80)
    last_name:  str = Field(min_length=1, max_length=80)
    # The 6-digit code from POST /api/auth/email-code; required while verification is on.
    code:       str | None = Field(default=None, min_length=6, max_length=6, pattern=r"^\d{6}$")


class EmailCodeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=200, pattern=_EMAIL_PATTERN)


class LoginBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email:    str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class RefreshBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(min_length=16, max_length=200)


def token_pair(user_id: str, *, verified: bool | None = None) -> dict:
    """Tokens for `user_id`; `verified` (whether the account proved its email) is looked up when
    not given."""
    if verified is None:
        verified = email_verified(user_id)
    access, access_exp = issue_access_token(user_id, email_verified=verified)
    refresh, refresh_exp = issue_refresh_token(user_id)
    return {
        "user_id": user_id,
        "token_type": "bearer",
        "access_token": access,
        "access_token_expires_at": access_exp,
        "refresh_token": refresh,
        "refresh_token_expires_at": refresh_exp,
    }


def count_sign_up(request: Request) -> None:
    """Every sign-up, successful or not, counts against the caller's address."""
    address = throttle.client_address(request)
    try:
        throttle.check(throttle.SIGNUP_IP, address)
    except throttle.Throttled as exc:
        raise throttle.too_many(exc) from None
    throttle.hit(throttle.SIGNUP_IP, address)


def domain_error() -> HTTPException:
    return HTTPException(status_code=403, detail=f"Sign-up is open to {email_codes.allowed_domains_text()} "
                                                 "email addresses only.")


def check_sign_up_email(email: str, code: str | None) -> bool:
    """The sign-up gate shared by every route that creates an account: an allowed domain, and the
    emailed code while verification is on. Returns whether the address was verified."""
    if not email_codes.domain_allowed(email):
        raise domain_error()
    if not config.email_verification_required():
        return False
    if code is None:
        raise HTTPException(status_code=422, detail="Enter the 6-digit code we emailed you.")
    try:
        email_codes.consume_code(email, code)
    except email_codes.CodeInvalid:
        raise HTTPException(status_code=400, detail="That code didn't work. Check it, or ask for a new one.") from None
    return True


@router.post("/email-code", status_code=status.HTTP_202_ACCEPTED)
def email_code(body: EmailCodeBody, request: Request) -> dict:
    if read_credential(body.email) is not None:
        raise HTTPException(status_code=409, detail="an account with this email already exists")
    try:
        ttl = email_codes.send_code(body.email, throttle.client_address(request))
    except email_codes.DomainNotAllowed:
        raise domain_error() from None
    except email_codes.ResendTooSoon as exc:
        raise HTTPException(status_code=429, detail=f"Wait {exc.retry_after_s} seconds before asking for another code.",
                            headers={"Retry-After": str(exc.retry_after_s)}) from None
    except throttle.Throttled as exc:
        raise throttle.too_many(exc) from None
    except mailer.EmailNotSent:
        raise HTTPException(status_code=503, detail="We couldn't send the email just now. Try again in a minute.") from None
    return {"sent": True, "expires_in_s": ttl}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterBody, request: Request) -> dict:
    count_sign_up(request)
    verified = check_sign_up_email(body.email, body.code)
    try:
        user_id = register_account(body.email, body.password, body.first_name, body.last_name,
                                   email_verified=verified)
    except EmailTaken:
        raise HTTPException(status_code=409, detail="an account with this email already exists") from None
    return token_pair(user_id, verified=verified)


@router.post("/login")
def login(body: LoginBody, request: Request) -> dict:
    email, address = throttle.email_key(body.email), throttle.client_address(request)
    try:
        throttle.check(throttle.LOGIN_EMAIL, email)
        throttle.check(throttle.LOGIN_IP, address)
    except throttle.Throttled as exc:
        raise throttle.too_many(exc) from None
    credential = read_credential(body.email)
    if credential is None:
        burn_password_check(body.password)
    elif verify_password(body.password, credential["password_hash"]):
        throttle.clear(throttle.LOGIN_EMAIL, email)
        return token_pair(credential["user_id"])
    throttle.hit(throttle.LOGIN_EMAIL, email)
    throttle.hit(throttle.LOGIN_IP, address)
    raise HTTPException(status_code=401, detail="invalid email or password")


@router.post("/refresh")
def refresh(body: RefreshBody, request: Request) -> dict:
    address = throttle.client_address(request)
    try:
        throttle.check(throttle.REFRESH_IP, address)
    except throttle.Throttled as exc:
        raise throttle.too_many(exc) from None
    throttle.hit(throttle.REFRESH_IP, address)
    user_id = consume_refresh_token(body.refresh_token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="invalid or expired refresh token")
    return token_pair(user_id)

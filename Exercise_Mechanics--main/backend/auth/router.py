"""Auth REST routes.

  • POST /api/auth/register — create an account (email + password + name) and sign in.
  • POST /api/auth/login    — exchange email + password for tokens.
  • POST /api/auth/refresh  — rotate a refresh token into a fresh token pair.

All three are rate-limited (auth/throttle.py): 429 with Retry-After when over a limit.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from backend.auth.store import (
    EmailTaken,
    consume_refresh_token,
    issue_refresh_token,
    read_credential,
    register_account,
)
from backend.auth import throttle
from backend.auth.tokens import burn_password_check, issue_access_token, verify_password

router = APIRouter(prefix="/api/auth")

_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email:      str = Field(min_length=3, max_length=200, pattern=_EMAIL_PATTERN)
    password:   str = Field(min_length=8, max_length=200)
    first_name: str = Field(min_length=1, max_length=80)
    last_name:  str = Field(min_length=1, max_length=80)


class LoginBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email:    str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class RefreshBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    refresh_token: str = Field(min_length=16, max_length=200)


def token_pair(user_id: str) -> dict:
    access, access_exp = issue_access_token(user_id)
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


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterBody, request: Request) -> dict:
    count_sign_up(request)
    try:
        user_id = register_account(body.email, body.password, body.first_name, body.last_name)
    except EmailTaken:
        raise HTTPException(status_code=409, detail="an account with this email already exists") from None
    return token_pair(user_id)


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

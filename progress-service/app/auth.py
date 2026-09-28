"""Authentication: the same bearer tokens the app already sends to the Run Module.

The token is verified (signature, expiry, optional issuer/audience) and its `sub` is the user id.
Nothing in a request body or query can choose which user is acting.
"""

from __future__ import annotations

import hmac

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.models import User, UserStats


class AuthError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def decode_token(token: str) -> dict:
    options = {"require": ["sub", "exp"]}
    kwargs: dict = {"options": options}
    if settings.jwt_issuer:
        kwargs["issuer"] = settings.jwt_issuer
    if settings.jwt_audience:
        kwargs["audience"] = settings.jwt_audience
    else:
        options["verify_aud"] = False
    header = jwt.get_unverified_header(token)
    alg = header.get("alg")
    if alg in settings.jwt_algorithms and alg.startswith(("RS", "ES", "PS")) and settings.jwt_public_key:
        return jwt.decode(token, settings.jwt_public_key, algorithms=[alg], **kwargs)
    if alg == "HS256" and settings.dev_tokens_allowed:
        return jwt.decode(token, settings.jwt_dev_secret, algorithms=["HS256"], **kwargs)
    raise jwt.InvalidAlgorithmError(f"algorithm {alg!r} not accepted")


def ensure_user(session: Session, user_id: str, name: str | None = None) -> User:
    user = session.get(User, user_id)
    if user is None:
        try:
            session.add(User(id=user_id, display_name=name, timezone=settings.default_timezone))
            session.flush()  # the user row must exist before its stats row
            session.add(UserStats(user_id=user_id))
            session.commit()
        except IntegrityError:  # a concurrent first request created it
            session.rollback()
        user = session.get(User, user_id)
    return user


def current_user(authorization: str | None = Header(default=None), session: Session = Depends(get_session)) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("missing bearer token")
    try:
        claims = decode_token(authorization.split(" ", 1)[1].strip())
    except jwt.PyJWTError as exc:
        raise AuthError(f"invalid token: {exc}") from exc
    sub = str(claims.get("sub") or "")
    if not sub or len(sub) > 64:
        raise AuthError("token has no usable subject")
    return ensure_user(session, sub, claims.get("name"))


def require_service_key(x_service_key: str | None = Header(default=None)) -> None:
    """Server-to-server calls (Run Module, Exercise backend, ops)."""
    if not settings.service_api_key or not x_service_key or not hmac.compare_digest(x_service_key, settings.service_api_key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="service key required")


def user_exists(session: Session, user_id: str) -> bool:
    return session.scalar(select(User.id).where(User.id == user_id)) is not None

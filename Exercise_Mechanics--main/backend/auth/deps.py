"""FastAPI dependency resolving `Authorization: Bearer <access token>` to a user id."""

from __future__ import annotations

from fastapi import Header, HTTPException, status

from backend.auth.tokens import verify_access_token
from backend.core.ids import is_valid_user_id


def current_user(authorization: str | None = Header(default=None)) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    user_id = verify_access_token(token) if scheme.lower() == "bearer" and token else None
    if user_id is None or not is_valid_user_id(user_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id

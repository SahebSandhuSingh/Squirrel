"""FastAPI dependencies. Everything stateful hangs off `app.state` so tests can build an app
with their own database, keys, Run Module double and storage double."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session

from app.auth import Viewer, bearer_token, get_or_create_user
from app.config import Settings
from app.ratelimit import RateLimiter
from app.services.media import MediaStorage
from app.services.run_module import RunModule


def get_db(request: Request) -> Iterator[Session]:
    yield from request.app.state.db.session()


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_limiter(request: Request) -> RateLimiter:
    return request.app.state.limiter


def get_run_module(request: Request) -> RunModule:
    return request.app.state.run_module


def get_storage(request: Request) -> MediaStorage:
    return request.app.state.storage


def get_viewer(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> Viewer:
    token = bearer_token(authorization)
    claims = request.app.state.verifier.verify(token)
    return Viewer(user=get_or_create_user(db, str(claims["sub"])), token=token)


DB = Annotated[Session, Depends(get_db)]
CurrentViewer = Annotated[Viewer, Depends(get_viewer)]
AppSettings = Annotated[Settings, Depends(get_settings_dep)]
Limiter = Annotated[RateLimiter, Depends(get_limiter)]
RunModuleDep = Annotated[RunModule, Depends(get_run_module)]
Storage = Annotated[MediaStorage, Depends(get_storage)]

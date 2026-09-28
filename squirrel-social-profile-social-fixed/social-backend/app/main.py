"""Squirrel Social — Profile + Social service.

    uvicorn app.main:app --port 8100          (from social-backend/)

Routes live under /v1 alongside the Run Module's, so both can sit behind one gateway and the
app can use a single base URL. See README.md for the contract.
"""

from __future__ import annotations

import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import TokenVerifier
from app.config import Settings, get_settings
from app.db import Database
from app.errors import ApiError, api_error_handler
from app.ratelimit import RateLimiter
from app.routers import feed, follows, internal, media, posts, profiles
from app.services.media import MediaStorage, make_storage
from app.services.run_module import HttpRunModule, RunModule


def create_app(
    settings: Settings | None = None,
    *,
    database: Database | None = None,
    run_module: RunModule | None = None,
    storage: MediaStorage | None = None,
    limiter: RateLimiter | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Squirrel Social — Profile & Social API", version="1.0.0")
    app.state.settings = settings
    app.state.verifier = TokenVerifier(settings)
    app.state.db = database or Database(settings.database_url)
    app.state.run_module = run_module or HttpRunModule(settings.run_module_url, settings.run_module_timeout_s)
    app.state.storage = storage or make_storage(settings)
    app.state.limiter = limiter or RateLimiter(enabled=settings.rate_limits_enabled)

    app.add_exception_handler(ApiError, api_error_handler)
    if settings.cors_origins:
        exact, pattern = split_cors_origins(settings.cors_origins)
        app.add_middleware(
            CORSMiddleware,
            allow_origins=exact,
            allow_origin_regex=pattern,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "Accept"],
            expose_headers=["Retry-After"],
        )

    # profiles first: its literal /users/me/… and /users/search routes must win over /users/{id}/….
    for r in (profiles.router, follows.router, feed.router, posts.router, media.router, internal.router):
        app.include_router(r)

    @app.get("/healthz", include_in_schema=False)
    def healthz() -> dict:
        return {"ok": True}

    return app


def split_cors_origins(origins: tuple[str, ...]) -> tuple[list[str], str | None]:
    """Exact origins, plus one regex for entries with a `*` (preview deploys, e.g.
    https://squirrel-*.vercel.app). A `*` matches letters, digits and hyphens only, never a dot,
    so it cannot reach another domain. Same rules as the Exercise backend's cors.py."""
    exact = [o.rstrip("/") for o in origins if "*" not in o]
    wild = [
        "".join("[a-z0-9-]+" if part == "*" else re.escape(part) for part in re.split(r"(\*)", o.rstrip("/")))
        for o in origins
        if "*" in o
    ]
    return exact, ("^(?:" + "|".join(wild) + ")$" if wild else None)


def __getattr__(name: str):
    # `uvicorn app.main:app` builds the app lazily so importing this module (tests, alembic)
    # doesn't require production settings.
    if name == "app":
        return create_app()
    raise AttributeError(name)

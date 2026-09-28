"""Mint a development token (HS256, JWT_DEV_SECRET). Refused when APP_ENV=production.

    python -m app.devtoken u_aanya --name "Aanya S." --hours 720
"""

from __future__ import annotations

import argparse
from datetime import timedelta

import jwt

from app.config import settings
from app.timeutil import utcnow


def mint(sub: str, name: str | None = None, hours: int = 24 * 30) -> str:
    if not settings.dev_tokens_allowed:
        raise SystemExit("dev tokens are disabled (APP_ENV=production or no JWT_DEV_SECRET)")
    now = utcnow()
    claims = {"sub": sub, "iat": now, "exp": now + timedelta(hours=hours)}
    if name:
        claims["name"] = name
    if settings.jwt_issuer:
        claims["iss"] = settings.jwt_issuer
    if settings.jwt_audience:
        claims["aud"] = settings.jwt_audience
    return jwt.encode(claims, settings.jwt_dev_secret, algorithm="HS256")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("sub")
    ap.add_argument("--name")
    ap.add_argument("--hours", type=int, default=24 * 30)
    a = ap.parse_args()
    print(mint(a.sub, a.name, a.hours))

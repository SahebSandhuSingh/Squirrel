"""Settings, read once from the environment. See .env.example for every variable.

The service fails closed: without a JWT verification key (public key or JWKS URL) it refuses
to start, so a misconfigured deploy can never accept unauthenticated traffic.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw not in (None, "") else default


def _opt(name: str) -> str | None:
    raw = os.environ.get(name, "").strip()
    return raw or None


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./social.db"

    # --- auth: the same RS256 bearer tokens the Run Module accepts ---------------------
    jwt_public_key: str | None = None      # PEM (SOCIAL_JWT_PUBLIC_KEY or SOCIAL_JWT_PUBLIC_KEY_FILE)
    jwks_url: str | None = None            # or a JWKS endpoint of the account service
    jwt_algorithms: tuple[str, ...] = ("RS256",)
    jwt_issuer: str | None = None
    jwt_audience: str | None = None

    # --- upstream services ---------------------------------------------------------------
    # Run Module base URL. XP and run stats are read from it with the caller's own token.
    run_module_url: str | None = None
    run_module_timeout_s: float = 4.0
    # Shared secret for service-to-service activity ingestion (POST /internal/v1/activities).
    internal_token: str | None = None

    # --- progression (mirrors the app: 2,000 XP per level) -------------------------------
    xp_per_level: int = 2000
    streak_timezone: str = "Asia/Kolkata"

    # --- media (S3-compatible). Unset bucket = uploads disabled (503). -----------------
    media_bucket: str | None = None
    media_region: str | None = None
    media_endpoint_url: str | None = None
    media_public_base_url: str | None = None
    media_max_bytes: int = 10 * 1024 * 1024

    # --- misc ----------------------------------------------------------------------------
    cors_origins: tuple[str, ...] = field(default_factory=tuple)
    rate_limits_enabled: bool = True


@lru_cache
def get_settings() -> Settings:
    key = _opt("SOCIAL_JWT_PUBLIC_KEY")
    key_file = _opt("SOCIAL_JWT_PUBLIC_KEY_FILE")
    if not key and key_file:
        with open(key_file) as f:
            key = f.read()
    return Settings(
        database_url=os.environ.get("SOCIAL_DATABASE_URL", "sqlite:///./social.db"),
        jwt_public_key=key.replace("\\n", "\n") if key else None,
        jwks_url=_opt("SOCIAL_JWKS_URL"),
        jwt_algorithms=tuple(a.strip() for a in os.environ.get("SOCIAL_JWT_ALGORITHMS", "RS256").split(",") if a.strip()),
        jwt_issuer=_opt("SOCIAL_JWT_ISSUER"),
        jwt_audience=_opt("SOCIAL_JWT_AUDIENCE"),
        run_module_url=(_opt("SOCIAL_RUN_MODULE_URL") or "").rstrip("/") or None,
        run_module_timeout_s=float(os.environ.get("SOCIAL_RUN_MODULE_TIMEOUT_S", "4")),
        internal_token=_opt("SOCIAL_INTERNAL_TOKEN"),
        xp_per_level=_int("SOCIAL_XP_PER_LEVEL", 2000),
        streak_timezone=os.environ.get("SOCIAL_STREAK_TIMEZONE", "Asia/Kolkata"),
        media_bucket=_opt("SOCIAL_MEDIA_BUCKET"),
        media_region=_opt("SOCIAL_MEDIA_REGION"),
        media_endpoint_url=_opt("SOCIAL_MEDIA_ENDPOINT_URL"),
        media_public_base_url=(_opt("SOCIAL_MEDIA_PUBLIC_BASE_URL") or "").rstrip("/") or None,
        media_max_bytes=_int("SOCIAL_MEDIA_MAX_BYTES", 10 * 1024 * 1024),
        cors_origins=tuple(o.strip() for o in os.environ.get("SOCIAL_CORS_ORIGINS", "").split(",") if o.strip()),
        rate_limits_enabled=os.environ.get("SOCIAL_RATE_LIMITS", "on").lower() not in ("off", "0", "false"),
    )

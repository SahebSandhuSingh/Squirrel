"""Settings from the environment (see .env.example). Read once, at import."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL", "sqlite:///./progress.db"))
    app_env: str = field(default_factory=lambda: _env("APP_ENV", "development"))
    jwt_algorithms: tuple[str, ...] = field(default_factory=lambda: tuple(a.strip() for a in _env("JWT_ALGORITHMS", "RS256").split(",")))
    jwt_public_key: str | None = field(default_factory=lambda: _env("JWT_PUBLIC_KEY") or _read(_env("JWT_PUBLIC_KEY_FILE")))
    jwt_issuer: str | None = field(default_factory=lambda: _env("JWT_ISSUER"))
    jwt_audience: str | None = field(default_factory=lambda: _env("JWT_AUDIENCE"))
    jwt_dev_secret: str | None = field(default_factory=lambda: _env("JWT_DEV_SECRET"))
    service_api_key: str | None = field(default_factory=lambda: _env("SERVICE_API_KEY"))
    level_curve: str = field(default_factory=lambda: _env("LEVEL_CURVE", "linear:2000"))
    default_timezone: str = field(default_factory=lambda: _env("DEFAULT_TIMEZONE", "Asia/Kolkata"))
    offline_sync_window_days: int = field(default_factory=lambda: int(_env("OFFLINE_SYNC_WINDOW_DAYS", "7")))
    challenge_resolve_grace_minutes: int = field(default_factory=lambda: int(_env("CHALLENGE_RESOLVE_GRACE_MINUTES", "120")))

    @property
    def dev_tokens_allowed(self) -> bool:
        return self.app_env != "production" and bool(self.jwt_dev_secret)


def _read(path: str | None) -> str | None:
    if not path:
        return None
    p = Path(path)
    return p.read_text() if p.exists() else None


settings = Settings()

"""Read-only client for the Run Module, called with the *caller's own* bearer token.

The Run Module stays the source of truth for runs and XP. Social never accepts those numbers
from the app; it reads them here:

  GET /v1/users/me/xp  → { xp, updated_at, breakdown }
  GET /v1/runs/:id     → { run_id, status, started_at, stats{distance_m, moving_time_s, elapsed_time_s}, ... }

ASSUMPTION (matches mobile/src/api/endpoints.ts): GET /v1/runs/:id only returns runs owned by
the token's user (404 otherwise), which is what makes "this run is yours" provable here.
"""

from __future__ import annotations

from typing import Protocol

import httpx


class RunModuleError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class RunModule(Protocol):
    configured: bool

    def get_xp(self, token: str) -> int | None: ...

    def get_run(self, token: str, run_id: str) -> dict: ...


class HttpRunModule:
    def __init__(self, base_url: str | None, timeout_s: float = 4.0):
        self.base_url = base_url
        self.configured = bool(base_url)
        self._client = httpx.Client(base_url=base_url, timeout=timeout_s) if base_url else None

    def _get(self, token: str, path: str) -> dict:
        if not self._client:
            raise RunModuleError(503, "Run Module is not configured.")
        try:
            res = self._client.get(path, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
        except httpx.HTTPError as e:
            raise RunModuleError(502, f"Run Module unreachable: {type(e).__name__}") from None
        if res.status_code >= 400:
            raise RunModuleError(res.status_code, f"Run Module returned {res.status_code}")
        try:
            body = res.json()
        except ValueError:
            raise RunModuleError(502, "Run Module returned invalid JSON") from None
        if not isinstance(body, dict):
            raise RunModuleError(502, "Run Module returned an unexpected body")
        return body

    def get_xp(self, token: str) -> int | None:
        """Best effort: None when unavailable (the cached figure is served instead)."""
        if not self.configured:
            return None
        try:
            xp = self._get(token, "/v1/users/me/xp").get("xp")
        except RunModuleError:
            return None
        return int(xp) if isinstance(xp, (int, float)) and xp >= 0 else None

    def get_run(self, token: str, run_id: str) -> dict:
        # run_id is validated against RUN_ID_RE (URL-safe characters only) before it gets here.
        return self._get(token, f"/v1/runs/{run_id}")

"""Password hashing and token primitives (stdlib only).

Access tokens are standard JWTs (HS256) carrying only the user id (`sub`) and expiry, short-lived
and stateless. They are signed with the same secret the Run Module verifies with (`JWT_SECRET`), so
one sign-in works against both backends. Refresh tokens are opaque random strings; only their
SHA-256 is stored server-side (see store.py) and each refresh rotates them.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from backend import config

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2 ** 14, 8, 1


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


# --- passwords ---------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64e(salt)}${_b64e(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = encoded.split("$")
        if scheme != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode(), salt=_b64d(salt), n=int(n), r=int(r), p=int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, _b64d(digest))


# A precomputed hash so a login for an unknown email still spends one scrypt — the response time
# does not reveal whether the account exists.
_DUMMY_HASH = hash_password("squirrel-dummy-password")


def burn_password_check(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


# --- signing key -------------------------------------------------------------

def _secret() -> bytes:
    # SQUIRREL_AUTH_SECRET, else the Run Module's JWT_SECRET: sharing it is what lets the Run
    # Module accept these tokens.
    for name in (config.AUTH_SECRET_ENV, config.SHARED_JWT_SECRET_ENV):
        env = os.environ.get(name)
        if env:
            return env.encode()
    # Development fallback: one random key persisted with 0600 permissions.
    path = config.AUTH_DIR / "secret.key"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            pass
        else:
            with os.fdopen(fd, "w") as f:
                f.write(secrets.token_urlsafe(48))
    return path.read_text().strip().encode()


# --- access tokens -----------------------------------------------------------

# Fixed header: the only algorithm issued or accepted, so "alg": "none" and algorithm swaps are
# rejected outright.
_JWT_HEADER = _b64e(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())


def _sign(signing_input: str) -> str:
    return _b64e(hmac.new(_secret(), signing_input.encode(), hashlib.sha256).digest())


def issue_access_token(user_id: str, now: float | None = None) -> tuple[str, int]:
    """Return (token, expires_at_epoch_seconds)."""
    iat = int(now if now is not None else time.time())
    exp = iat + config.ACCESS_TOKEN_TTL_SECONDS
    payload = _b64e(json.dumps({"sub": user_id, "iat": iat, "exp": exp, "typ": "access"},
                               separators=(",", ":")).encode())
    signing_input = f"{_JWT_HEADER}.{payload}"
    return f"{signing_input}.{_sign(signing_input)}", exp


def verify_access_token(token: str, now: float | None = None) -> str | None:
    """Return the user id for a valid, unexpired access token, else None."""
    try:
        header, payload, sig = token.split(".")
        if header != _JWT_HEADER or not hmac.compare_digest(sig, _sign(f"{header}.{payload}")):
            return None
        claims = json.loads(_b64d(payload))
    except (ValueError, TypeError):
        return None
    if not isinstance(claims, dict) or claims.get("typ") != "access" or not isinstance(claims.get("sub"), str):
        return None
    if int(claims.get("exp", 0)) <= (now if now is not None else time.time()):
        return None
    return claims["sub"]


# --- refresh tokens ----------------------------------------------------------

def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

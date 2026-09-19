"""Identity / slug helpers shared across routes.

`safe_user_id` is the path-traversal guard for anything that names a user directory
(the WS query param, REST path params). `slugify` mints the human part of a new user id.
Both are lifted verbatim from the reference backend so ids stay stable across the migration.
"""

from __future__ import annotations

import re

# Only [a-z0-9-] is ever a valid user_id (our slug + hex hash format). Anything else is
# rejected to "_anonymous" so a crafted value can never escape USERS_DIR via path traversal.
_USER_ID_RE = re.compile(r"^[a-z0-9-]{1,64}$")
_ANON_USER = "_anonymous"


def is_valid_user_id(raw: str | None) -> bool:
    """True only for a canonical user id; unlike ``safe_user_id`` this never substitutes."""
    return bool(raw and _USER_ID_RE.fullmatch(raw))


def safe_user_id(raw: str | None) -> str:
    return raw if is_valid_user_id(raw) else _ANON_USER


def slugify(text: str) -> str:
    """Lowercase, collapse non-alphanumerics to single hyphens, trim. Empty → 'user'."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "user"

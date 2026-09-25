"""Application configuration — visibility floors and per-user storage paths."""

from pathlib import Path

# --- landmark visibility floors (single source of truth for BOTH tiers) ------
#   VISIBILITY_MIN — base "in frame" floor (skeleton draw, non-critical gating).
#   CONFIDENCE_MIN — stricter "safe to compute on" floor (the joints a rule computes on).
VISIBILITY_MIN = 0.3
CONFIDENCE_MIN = 0.5

# --- per-user storage --------------------------------------------------------
# One directory per user (slug + short hash) under USERS_DIR, holding the user's profile.json,
# skill.json, and their sessions. Lives at the REPO ROOT (<root>/data/users), OUTSIDE the
# backend package — decoupling data from code so a backend rewrite never touches user data.
# config.py is at backend/config.py, so parent.parent is the repo root.
_REPO_ROOT       = Path(__file__).resolve().parent.parent
USERS_DIR        = _REPO_ROOT / "data" / "users"
PROFILE_FILENAME = "profile.json"
SKILL_FILENAME   = "skill.json"   # the user's chosen skill level (set on the dashboard)


# Moderation reports are not any one user's data, so they live apart from the user directories.
REPORTS_DIR      = _REPO_ROOT / "data" / "moderation" / "reports"


def user_dir(user_id: str) -> Path:
    """Absolute path to a single user's directory under USERS_DIR."""
    return USERS_DIR / user_id

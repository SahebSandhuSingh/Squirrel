"""User persistence — the minimal surface Phase 1 (calibration) needs.

Onboarding must mint a user id + directory before calibration can write that user's
baseline into it, so `create_user_record` is migrated here. Storage is unchanged from
the reference: users/{user_id}/profile.json. The full profile/skill/session features
migrate with their own phases.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from backend.config import PROFILE_FILENAME, SKILL_FILENAME, user_dir
from backend.core.ids import slugify

SKILLS = ("beginner", "intermediate", "advanced")


def read_profile(user_id: str) -> dict | None:
    """Load a user's saved profile.json (height, weight, …) from their directory under
    USERS_DIR (now <repo_root>/data/users). Returns None if they have no profile."""
    path = user_dir(user_id) / PROFILE_FILENAME
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def create_user_record(profile: dict) -> dict:
    """Mint a unique id (name-slug + short hash), create the user's directory, and persist
    the profile as JSON. Returns the lightweight identity the client caches. The user's
    calibrated_keypoints.json later lands in the same directory."""
    user_id = f"{slugify(profile['first_name'] + '-' + profile['last_name'])}-{uuid.uuid4().hex[:6]}"
    record = {**profile, "user_id": user_id, "created_at": datetime.now(timezone.utc).isoformat()}

    udir = user_dir(user_id)
    udir.mkdir(parents=True, exist_ok=True)
    with open(udir / PROFILE_FILENAME, "w") as f:
        json.dump(record, f, indent=2)

    print(f"[api] created user {user_id}")
    return {"user_id": user_id, "first_name": profile["first_name"], "last_name": profile["last_name"]}


def read_skill(user_id: str) -> tuple[str, bool]:
    """Return (skill_level, configured). `configured` is whether the user has EXPLICITLY set a
    skill (skill.json exists with a valid level) — distinct from the 'beginner' fallback shown
    to a brand-new profile. The UI uses `configured` to decide 'Update' (not yet saved) vs
    'Updated' (persisted), so a fresh profile isn't wrongly shown as already-updated."""
    path = user_dir(user_id) / SKILL_FILENAME
    if path.exists():
        try:
            level = json.load(open(path)).get("skill_level")
            if level in SKILLS:
                return level, True
        except (OSError, ValueError):
            pass
    return "beginner", False


def write_skill(user_id: str, level: str) -> str:
    """Persist the chosen skill level → users/{id}/skill.json (creating the dir if needed).
    An unknown level is coerced to 'beginner'. Returns the level actually written."""
    lvl = level if level in SKILLS else "beginner"
    udir = user_dir(user_id)
    udir.mkdir(parents=True, exist_ok=True)
    with open(udir / SKILL_FILENAME, "w") as f:
        json.dump({"skill_level": lvl, "updated_at": datetime.now(timezone.utc).isoformat()}, f, indent=2)
    print(f"[api] updated skill for {user_id}: {lvl}")
    return lvl

"""User REST routes.

  • POST /api/users                 — onboarding: mint the user id + directory.
  • GET  /api/users/{id}            — profile (dashboard height/weight/BMI).
  • GET/POST /api/users/{id}/skill  — read/persist the chosen skill level.
Minimal session creation lives in backend/sessions/router.py.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.core.ids import safe_user_id
from backend.users.store import create_user_record, read_profile, read_skill, write_skill

router = APIRouter(prefix="/api")


class UserProfile(BaseModel):
    """Onboarding payload. Field names match the frontend OnboardingForm one-to-one."""
    first_name:    str = Field(min_length=1, max_length=80)
    last_name:     str = Field(min_length=1, max_length=80)
    gender:        str
    height_cm:     float = Field(gt=0, lt=300)
    weight_kg:     float = Field(gt=0, lt=500)
    date_of_birth: str   # ISO date (YYYY-MM-DD) from the client date picker
    mobile:        str = Field(min_length=3, max_length=32)
    email:         str = Field(min_length=3, max_length=200)


@router.post("/users")
def create_user(profile: UserProfile) -> dict:
    return create_user_record(profile.model_dump())


@router.get("/users/{user_id}")
def get_user(user_id: str) -> dict:
    """Return a user's saved profile.json (height, weight, …) — the dashboard reads this to
    show profile fields + compute BMI. 404 if the user has no profile."""
    profile = read_profile(safe_user_id(user_id))
    if profile is None:
        raise HTTPException(status_code=404, detail="user not found")
    return profile


class SkillUpdate(BaseModel):
    skill_level: str


@router.get("/users/{user_id}/skill")
def get_skill(user_id: str) -> dict:
    """Current skill level + whether it's been explicitly set. `configured` is False for a new
    profile (no skill.json) so the dashboard shows 'Update', not 'Updated'."""
    level, configured = read_skill(safe_user_id(user_id))
    return {"skill_level": level, "configured": configured}


@router.post("/users/{user_id}/skill")
def update_skill(user_id: str, body: SkillUpdate) -> dict:
    """Persist the skill level chosen on the dashboard → users/{id}/skill.json."""
    level = write_skill(safe_user_id(user_id), body.skill_level)
    return {"skill_level": level, "configured": True}

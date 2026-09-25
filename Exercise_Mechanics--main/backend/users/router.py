"""User REST routes.

  • POST /api/users                 — onboarding: mint the user id + directory, plus any answered
                                      sign-up questions (see backend/profiles/).
  • GET  /api/users/{id}            — profile (dashboard height/weight/BMI; latest measurements).
  • GET/POST /api/users/{id}/skill  — read/persist the chosen skill level.
Minimal session creation lives in backend/sessions/router.py.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from backend.core.ids import safe_user_id
from backend.profiles import service as profiles
from backend.profiles.models import SignUpDetails, check_date_of_birth
from backend.profiles.vocab import GENDERS, HEIGHT_CM, WEIGHT_KG
from backend.users.store import read_skill, write_skill

router = APIRouter(prefix="/api")

_CORE_FIELDS = {"first_name", "last_name", "gender", "height_cm", "weight_kg", "date_of_birth", "mobile", "email"}


class UserProfile(SignUpDetails):
    """Onboarding payload. The core fields match the frontend OnboardingForm one-to-one; the
    sign-up questions (fitness, activities, physique, habits, consents) are optional."""
    first_name:    str = Field(min_length=1, max_length=80)
    last_name:     str = Field(min_length=1, max_length=80)
    gender:        Literal[GENDERS]
    height_cm:     float = Field(ge=HEIGHT_CM[0], le=HEIGHT_CM[1])
    weight_kg:     float = Field(ge=WEIGHT_KG[0], le=WEIGHT_KG[1])
    date_of_birth: str   # ISO date (YYYY-MM-DD) from the client date picker; age is derived from it
    mobile:        str = Field(min_length=3, max_length=32)
    email:         str = Field(min_length=3, max_length=200)

    @field_validator("date_of_birth")
    @classmethod
    def _real_date(cls, value: str) -> str:
        return check_date_of_birth(value)


@router.post("/users")
def create_user(profile: UserProfile) -> dict:
    try:
        return profiles.onboard(
            profile.model_dump(include=_CORE_FIELDS),
            profile.sections(),
            [c.model_dump() for c in profile.consents],
        )
    except profiles.ProfileError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail()) from exc


@router.get("/users/{user_id}")
def get_user(user_id: str) -> dict:
    """Return a user's saved profile.json (height, weight, …) — the dashboard reads this to
    show profile fields + compute BMI. Height and weight are the latest logged measurements.
    404 if the user has no profile."""
    profile = profiles.profile_with_latest_body(safe_user_id(user_id))
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

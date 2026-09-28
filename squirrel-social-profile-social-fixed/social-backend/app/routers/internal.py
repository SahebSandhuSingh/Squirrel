"""Service-to-service activity ingestion — how exercise modules publish into Social.

  POST /internal/v1/activities   Authorization: Bearer $SOCIAL_INTERNAL_TOKEN

The Run Module's finish worker (or the Exercise backend) calls this once an activity is final.
It is idempotent on (source, source_ref): re-sending the same run returns the same activity, with
its summary (name, distance, duration, calories, metrics) updated to the latest one sent. The
Exercise backend re-sends a workout after each set, so the profile shows the finished session.
The activity then shows in the owner's profile and can be shared with
POST /v1/posts { activity: { source: "activity", activity_id } }. Never exposed to the app.
"""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import APIRouter, Header, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.auth import bearer_token, get_or_create_user
from app.db import utcnow
from app.deps import DB, AppSettings
from app.errors import ApiError, conflict
from app.models import Activity
from app.schemas import InternalActivityOut, InternalActivityIn
from app.services import social

router = APIRouter(prefix="/internal/v1", tags=["internal"], include_in_schema=False)


def _check_service_token(settings, authorization: str | None) -> None:
    if not settings.internal_token:
        raise ApiError(404, "not_found", "Not found")
    token = bearer_token(authorization)
    if not hmac.compare_digest(token.encode(), settings.internal_token.encode()):
        raise ApiError(401, "unauthorized", "Invalid service token.", {"WWW-Authenticate": "Bearer"})


@router.post("/activities", response_model=InternalActivityOut)
def ingest_activity(
    body: InternalActivityIn,
    response: Response,
    db: DB,
    settings: AppSettings,
    authorization: Annotated[str | None, Header()] = None,
):
    _check_service_token(settings, authorization)
    user = get_or_create_user(db, body.user_subject)
    existing = db.scalar(select(Activity).where(Activity.source == body.source, Activity.source_ref == body.source_ref))
    if existing:
        if existing.user_id != user.id:
            raise conflict("source_ref already belongs to another user.")
        _update_summary(existing, body)
        db.commit()
        return InternalActivityOut(activity_id=existing.id, created=False)
    activity = Activity(
        user_id=user.id,
        type=body.type,
        source=body.source,
        source_ref=body.source_ref,
        verified=True,  # measured by the publishing module
        name=body.name,
        distance_m=body.distance_m,
        duration_s=body.duration_s,
        calories=body.calories,
        metrics=body.metrics,
        started_at=body.started_at,
        created_at=utcnow(),
    )
    db.add(activity)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Activity).where(Activity.source == body.source, Activity.source_ref == body.source_ref))
        if existing and existing.user_id == user.id:
            _update_summary(existing, body)
            db.commit()
            return InternalActivityOut(activity_id=existing.id, created=False)
        raise conflict("source_ref already belongs to another user.") from None
    social.after_activity_recorded(db, activity, settings)
    db.commit()
    response.status_code = status.HTTP_201_CREATED
    return InternalActivityOut(activity_id=activity.id, created=True)


def _update_summary(activity: Activity, body: InternalActivityIn) -> None:
    """A re-sent activity carries its latest summary; its identity (owner, source, type) stays."""
    activity.name = body.name
    activity.distance_m = body.distance_m
    activity.duration_s = body.duration_s
    activity.calories = body.calories
    activity.metrics = body.metrics

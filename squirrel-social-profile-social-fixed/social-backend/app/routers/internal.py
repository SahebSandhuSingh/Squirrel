"""Service-to-service routes — how the other modules publish into Social.

  POST /internal/v1/activities              Authorization: Bearer $SOCIAL_INTERNAL_TOKEN
  POST /internal/v1/notifications           a territory steal (Run Module) → the in-app list + push
  POST /internal/v1/tasks/event-reminders   send due event reminders now (for an external cron)

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
from app.models import Activity, User
from app.schemas import InternalActivityOut, InternalActivityIn
from app.schemas_community import InternalNotificationIn, InternalNotificationOut
from app.services import notify as notifications
from app.services import reminders, social

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


def _area(data: dict) -> str:
    value = data.get("area_delta_m2")
    if not isinstance(value, (int, float)) or value <= 0:
        return ""
    return f"{value / 1_000_000:.2f} km²" if value >= 100_000 else f"{round(value):,} m²"


def _territory_text(kind: str, actor: User | None, data: dict) -> tuple[str, str]:
    area = _area(data)
    if kind == "territory_lost":
        who = actor.display_name if actor else "Someone"
        return f"{who} stole your territory", (f"{area} taken. " if area else "") + "Run it back!"
    if kind == "territory_captured":
        n = data.get("territories_taken")
        n = n if isinstance(n, int) and n > 1 else 1
        return (f"You captured {n} territories" if n > 1 else "You captured territory"), (f"{area} is yours now." if area else "")
    return "Your territory faded", "Run there again to claim it back."


@router.post("/notifications", response_model=InternalNotificationOut)
def ingest_notification(
    body: InternalNotificationIn,
    db: DB,
    settings: AppSettings,
    authorization: Annotated[str | None, Header()] = None,
):
    _check_service_token(settings, authorization)
    user = get_or_create_user(db, body.user_subject)
    actor = None
    if body.actor_subject and body.actor_subject != body.user_subject:
        actor = db.scalar(select(User).where(User.auth_subject == body.actor_subject))
    title, text = _territory_text(body.kind, actor, body.data)
    data = {k: v for k, v in body.data.items() if isinstance(v, (str, int, float, bool)) and len(str(v)) <= 100}
    created = notifications.notify(db, user.id, body.kind, title, text, data={"route": "/territory", **data},
                                   actor_id=actor.id if actor else None, dedupe_key=body.dedupe_key)
    db.commit()
    return InternalNotificationOut(created=created > 0)


@router.post("/tasks/event-reminders")
def run_event_reminders(
    db: DB,
    settings: AppSettings,
    authorization: Annotated[str | None, Header()] = None,
):
    _check_service_token(settings, authorization)
    return {"reminded_events": reminders.send_due(db, settings)}

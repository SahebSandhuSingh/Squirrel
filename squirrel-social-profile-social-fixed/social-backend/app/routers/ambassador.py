"""Ambassador applications.

  GET  /v1/ambassador/application
  POST /v1/ambassador/application
  
  GET  /v1/admin/ambassador/applications
  POST /v1/admin/ambassador/applications/{id}/decision
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import select

from app.auth import Viewer
from app.db import utcnow
from app.deps import DB, AppSettings, CurrentViewer, Limiter, Storage
from app.errors import forbidden, invalid
from app.models import AmbassadorApplication, Member, User, UserStats
from app.rules import AMBASSADOR_FORM, AMBASSADOR_FORM_VERSION
from app.schemas import UserSummary
from app.schemas_community import (
    AdminAmbassadorApplication,
    AdminAmbassadorDecision,
    AdminAmbassadorList,
    AmbassadorApplication as SchemaAmbassadorApplication,
    AmbassadorField,
    AmbassadorState,
    CreateAmbassadorApplication,
)
from app.services import notify

router = APIRouter(prefix="/v1", tags=["ambassador"])


def _check_admin(user: User):
    if user.role != "admin":
        raise forbidden("You can't do that.")


def _serialize_app(app: AmbassadorApplication | None) -> SchemaAmbassadorApplication | None:
    if not app:
        return None
    return SchemaAmbassadorApplication(
        id=app.id,
        status=app.status,
        submitted_at=app.submitted_at,
        decided_at=app.decided_at,
        message=app.message,
    )


@router.get("/ambassador/application", response_model=AmbassadorState)
def get_ambassador_application(db: DB, viewer: CurrentViewer, settings: AppSettings):
    app = db.scalar(select(AmbassadorApplication).where(AmbassadorApplication.user_id == viewer.id).order_by(AmbassadorApplication.submitted_at.desc()).limit(1))
    
    # 1. Verification check (VERIFIED members only)
    member = db.get(Member, viewer.id)
    if not member or not member.email_verified:
        return AmbassadorState(
            open=False, 
            closed_reason="verify_email", 
            application=_serialize_app(app), 
            fields=[]
        )
    
    # 2. Reapply cooldown
    if app and app.status == "rejected" and app.decided_at:
        if utcnow() < app.decided_at + timedelta(days=settings.ambassador_reapply_days):
            return AmbassadorState(
                open=False,
                closed_reason="reapply_later",
                application=_serialize_app(app),
                fields=[]
            )
            
    # 3. Settings open flag
    if not settings.ambassador_open:
        return AmbassadorState(
            open=False,
            closed_reason="Check back soon — new rounds open through the year.",
            application=_serialize_app(app),
            fields=[]
        )

    fields = []
    for f in AMBASSADOR_FORM:
        prefill = None
        if f["key"] == "name":
            prefill = viewer.user.display_name
        elif f["key"] == "hostel":
            prefill = viewer.user.hostel
        fields.append(
            AmbassadorField(
                key=f["key"],
                label=f["label"],
                type=f["type"],
                required=f["required"],
                max_length=f.get("max_length"),
                options=f.get("options"),
                prefill=prefill
            )
        )

    return AmbassadorState(
        open=True,
        closed_reason=None,
        application=_serialize_app(app),
        fields=fields
    )


@router.post("/ambassador/application", response_model=SchemaAmbassadorApplication)
def create_ambassador_application(body: CreateAmbassadorApplication, db: DB, viewer: CurrentViewer, settings: AppSettings, limiter: Limiter):
    # Check if a pending or under_review application already exists for this idempotency key
    # (Or just check existing applications)
    existing = db.scalar(select(AmbassadorApplication).where(AmbassadorApplication.user_id == viewer.id, AmbassadorApplication.idempotency_key == body.idempotency_key))
    if existing:
        return _serialize_app(existing)

    # Check for any open applications
    open_app = db.scalar(
        select(AmbassadorApplication)
        .where(AmbassadorApplication.user_id == viewer.id, AmbassadorApplication.status.in_(["pending", "under_review", "approved"]))
    )
    if open_app:
        return _serialize_app(open_app)

    # Validation
    answers = body.answers
    form_keys = {f["key"] for f in AMBASSADOR_FORM}
    for k in answers:
        if k not in form_keys:
            raise invalid(f"Unknown field: {k[:40]}")

    for f in AMBASSADOR_FORM:
        val = answers.get(f["key"])
        if not val or not str(val).strip():
            if f["required"]:
                raise invalid(f"Missing required field: {f['key']}")
            continue
            
        val_str = str(val).strip()
        if f.get("max_length") and len(val_str) > f["max_length"]:
            raise invalid(f"Field {f['key']} must be at most {f['max_length']} characters.")
            
        if f["type"] == "select" and f.get("options") and val_str not in f["options"]:
            raise invalid(f"Field {f['key']} must be one of the options.")
            
        answers[f["key"]] = val_str

    limiter.hit("ambassador", str(viewer.id))
    
    app = AmbassadorApplication(
        user_id=viewer.id,
        status="pending",
        form_version=AMBASSADOR_FORM_VERSION,
        answers=answers,
        idempotency_key=body.idempotency_key
    )
    db.add(app)
    db.flush()
    db.commit()
    
    return _serialize_app(app)


@router.get("/admin/ambassador/applications", response_model=AdminAmbassadorList)
def list_ambassador_applications(status: str, db: DB, viewer: CurrentViewer, settings: AppSettings, storage: Storage):
    _check_admin(viewer.user)
    
    rows = db.execute(
        select(AmbassadorApplication, User, UserStats.xp)
        .join(User, User.id == AmbassadorApplication.user_id)
        .join(UserStats, UserStats.user_id == User.id)
        .where(AmbassadorApplication.status == status)
        .order_by(AmbassadorApplication.submitted_at.desc())
    ).all()
    
    from app.services import social
    urls = social.media_urls(db, storage, [u.avatar_media_id for _, u, _ in rows])
    items = []
    for app, u, xp in rows:
        items.append(
            AdminAmbassadorApplication(
                id=app.id,
                status=app.status,
                submitted_at=app.submitted_at,
                decided_at=app.decided_at,
                message=app.message,
                user=social.user_summary(u, xp, settings, urls.get(u.avatar_media_id)),
                answers=app.answers,
                form_version=app.form_version
            )
        )
    return AdminAmbassadorList(items=items)


@router.post("/admin/ambassador/applications/{id}/decision", response_model=SchemaAmbassadorApplication)
def decide_ambassador_application(id: uuid.UUID, body: AdminAmbassadorDecision, db: DB, viewer: CurrentViewer, settings: AppSettings):
    _check_admin(viewer.user)
    
    app = db.get(AmbassadorApplication, id)
    if not app:
        raise invalid("Application not found")
        
    app.status = body.status
    if body.status in ("approved", "rejected"):
        app.decided_at = utcnow()
    app.message = body.message
    
    if body.status == "approved":
        notify.notify(
            db, 
            app.user_id, 
            "ambassador", 
            "Application Approved", 
            body.message or "Welcome to the crew behind the crew.", 
            data={"route": "/ambassador"}, 
            dedupe_key=f"ambassador:{app.id}:{body.status}"
        )
    elif body.status == "rejected":
        notify.notify(
            db, 
            app.user_id, 
            "ambassador", 
            "Application Not This Time", 
            body.message or "Thanks for putting your hand up. Keep moving — there'll be another round.", 
            data={"route": "/ambassador"}, 
            dedupe_key=f"ambassador:{app.id}:{body.status}"
        )
        
    db.commit()
    
    return _serialize_app(app)

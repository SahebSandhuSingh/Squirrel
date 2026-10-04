"""The in-app notification list and the device push tokens.

  GET    /v1/notifications?cursor=           newest first, with the unread count
  GET    /v1/notifications/unread-count
  POST   /v1/notifications/read {ids?}       mark some (or, without ids, all) as read
  POST   /v1/me/push-tokens {token, platform}   register this device's Expo push token
  DELETE /v1/me/push-tokens/{token}             on sign-out

Notifications are created by the other routes (services/notify.py) and by the Run Module through
POST /internal/v1/notifications (territory steals).
"""

from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy import delete, func, select, update

from app.db import utcnow
from app.deps import DB, AppSettings, CurrentViewer, Limiter, Storage
from app.models import Notification, PushToken
from app.pagination import before, clamp_limit, decode_uuid_cursor, encode_cursor
from app.schemas_community import MarkReadRequest, NotificationOut, NotificationPage, PushTokenRequest, UnreadCount
from app.services import community

router = APIRouter(prefix="/v1", tags=["notifications"])


def _unread(db, user_id) -> int:
    return int(db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None))) or 0)


@router.get("/notifications", response_model=NotificationPage)
def list_notifications(db: DB, viewer: CurrentViewer, settings: AppSettings, storage: Storage, cursor: str | None = None, limit: int = 30):
    n = clamp_limit(limit)
    stmt = select(Notification).where(Notification.user_id == viewer.id)
    if cursor:
        ts, key = decode_uuid_cursor(cursor)
        stmt = stmt.where(before(Notification.created_at, Notification.id, ts, key))
    rows = list(db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(n + 1)))
    page = rows[:n]
    actors = community.summaries(db, {r.actor_id for r in page if r.actor_id}, settings, storage)
    return NotificationPage(
        items=[NotificationOut(id=r.id, kind=r.kind, title=r.title, body=r.body, data=r.data or {},
                               actor=actors.get(r.actor_id) if r.actor_id else None, created_at=r.created_at,
                               read=r.read_at is not None) for r in page],
        next_cursor=encode_cursor(page[-1].created_at, page[-1].id) if len(rows) > n else None,
        unread=_unread(db, viewer.id),
    )


@router.get("/notifications/unread-count", response_model=UnreadCount)
def unread_count(db: DB, viewer: CurrentViewer):
    return UnreadCount(unread=_unread(db, viewer.id))


@router.post("/notifications/read", response_model=UnreadCount)
def mark_read(body: MarkReadRequest, db: DB, viewer: CurrentViewer):
    stmt = update(Notification).where(Notification.user_id == viewer.id, Notification.read_at.is_(None))
    if body.ids is not None:
        stmt = stmt.where(Notification.id.in_(body.ids))
    db.execute(stmt.values(read_at=utcnow()))
    db.commit()
    return UnreadCount(unread=_unread(db, viewer.id))


@router.post("/me/push-tokens", status_code=status.HTTP_204_NO_CONTENT)
def register_push_token(body: PushTokenRequest, db: DB, viewer: CurrentViewer, limiter: Limiter):
    limiter.hit("push:register", str(viewer.id))
    now = utcnow()
    token = db.get(PushToken, body.token)
    if token is None:
        db.add(PushToken(token=body.token, user_id=viewer.id, platform=body.platform, created_at=now, last_seen_at=now))
    else:  # a device that changed hands follows its new owner
        token.user_id, token.platform, token.last_seen_at, token.disabled_at = viewer.id, body.platform, now, None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me/push-tokens/{token}", status_code=status.HTTP_204_NO_CONTENT)
def remove_push_token(token: str, db: DB, viewer: CurrentViewer):
    db.execute(delete(PushToken).where(PushToken.token == token, PushToken.user_id == viewer.id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

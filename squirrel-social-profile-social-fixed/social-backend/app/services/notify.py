"""Notifications: one row in the in-app list per recipient, plus a push to each of their devices
(services/push.py, sent after the request commits).

`dedupe_key` makes a notification land at most once per user, so a retried delivery (the Run
Module re-sends until it gets a 2xx) cannot double-notify. `data.route` is the app screen a tap
opens.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import utcnow
from app.models import Notification, PushToken
from app.services import push
from app.services.social import insert_ignore


def notify(
    db: Session,
    user_ids: uuid.UUID | Iterable[uuid.UUID],
    kind: str,
    title: str,
    body: str = "",
    *,
    data: dict | None = None,
    actor_id: uuid.UUID | None = None,
    dedupe_key: str | None = None,
) -> int:
    """Notify one user or several. Returns how many notifications were created (duplicates by
    `dedupe_key` are skipped). Never notifies the actor about their own action."""
    ids = [user_ids] if isinstance(user_ids, uuid.UUID) else list(dict.fromkeys(user_ids))
    ids = [i for i in ids if i != actor_id]
    if not ids:
        return 0
    title, body, data = title[:120], body[:240], dict(data or {})
    now = utcnow()
    created: list[uuid.UUID] = []
    for user_id in ids:
        values = {"id": uuid.uuid4(), "user_id": user_id, "kind": kind, "title": title, "body": body, "data": data,
                  "actor_id": actor_id, "dedupe_key": dedupe_key, "created_at": now, "read_at": None}
        if dedupe_key is None:
            db.add(Notification(**values))
            created.append(user_id)
        elif insert_ignore(db, Notification, values):
            created.append(user_id)
    if created:
        tokens = db.execute(
            select(PushToken.token).where(PushToken.user_id.in_(created), PushToken.disabled_at.is_(None))
        ).scalars().all()
        push.queue(db, [
            {"to": token, "title": title, "body": body, "sound": "default", "data": {"kind": kind, **data}}
            for token in tokens
        ])
    return len(created)

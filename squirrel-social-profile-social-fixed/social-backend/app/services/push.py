"""Push delivery through Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/).

The app registers its Expo push token (POST /v1/me/push-tokens); a notification (services/notify.py)
queues one message per live token on the database session, and they are sent once that session
commits, so a rolled-back request never pushes. Sending happens on a small thread pool: a slow Expo
never slows the request. A token Expo reports as `DeviceNotRegistered` (app uninstalled) is
disabled.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Protocol

import httpx
from sqlalchemy import event, update
from sqlalchemy.orm import Session

from app.db import Database, utcnow
from app.models import PushToken

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_BATCH = 100  # Expo accepts up to 100 messages per request


class PushSender(Protocol):
    def send(self, messages: list[dict]) -> None: ...


class ExpoPush:
    def __init__(self, database: Database, *, enabled: bool = True, access_token: str | None = None,
                 client: httpx.Client | None = None):
        self.database = database
        self.enabled = enabled
        self._headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if access_token:
            self._headers["Authorization"] = f"Bearer {access_token}"
        self._client = client or httpx.Client(timeout=10.0)
        self._pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="expo-push")

    def send(self, messages: list[dict]) -> None:
        if self.enabled and messages:
            self._pool.submit(self.deliver, list(messages))

    def deliver(self, messages: list[dict]) -> None:
        dead: list[str] = []
        for start in range(0, len(messages), _BATCH):
            chunk = messages[start:start + _BATCH]
            try:
                res = self._client.post(EXPO_PUSH_URL, json=chunk, headers=self._headers)
                tickets = res.json().get("data", []) if res.status_code < 500 else []
            except (httpx.HTTPError, ValueError) as e:
                log.warning("expo push failed: %s", e)
                continue
            if res.status_code >= 400:
                log.warning("expo push answered %s: %s", res.status_code, res.text[:300])
                continue
            for message, ticket in zip(chunk, tickets if isinstance(tickets, list) else []):
                if not isinstance(ticket, dict) or ticket.get("status") != "error":
                    continue
                details = ticket.get("details") if isinstance(ticket.get("details"), dict) else {}
                if details.get("error") == "DeviceNotRegistered":
                    dead.append(message["to"])
        if dead:
            with self.database.SessionLocal() as db:
                db.execute(update(PushToken).where(PushToken.token.in_(dead)).values(disabled_at=utcnow()))
                db.commit()


class RecordingPush:
    """Test double: keeps what would have been sent."""

    def __init__(self):
        self.sent: list[dict] = []

    def send(self, messages: list[dict]) -> None:
        self.sent.extend(messages)


# --------------------------------------------------------------------------- session hooks


def attach(db: Session, sender: PushSender | None) -> Session:
    db.info["push"] = sender
    return db


def queue(db: Session, messages: list[dict]) -> None:
    db.info.setdefault("pending_push", []).extend(messages)


@event.listens_for(Session, "after_commit")
def _send_after_commit(session: Session) -> None:
    messages = session.info.pop("pending_push", None)
    sender = session.info.get("push")
    if messages and sender is not None:
        try:
            sender.send(messages)
        except Exception:  # never fail a committed request over a push
            log.exception("queueing push failed")


@event.listens_for(Session, "after_rollback")
def _drop_after_rollback(session: Session) -> None:
    session.info.pop("pending_push", None)

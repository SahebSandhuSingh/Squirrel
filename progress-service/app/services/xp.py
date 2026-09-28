"""The XP engine. The only code path that changes a user's XP.

award() writes one xp_transactions row and bumps the user's lifetime + daily totals in the same
DB transaction. (user_id, source, source_id) is unique, so the same award can never be paid twice:
a repeated request, a retried job or a re-synced event just gets 0 back.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import XpTransaction
from app.rules import XpSource
from app.services import aggregates


def award(session: Session, user_id: str, amount: int, source: str, source_id: str, day: date, meta: dict | None = None) -> int:
    """Pay `amount` XP once for (source, source_id). Returns the XP actually awarded (0 if duplicate)."""
    if source not in XpSource.ALL:
        raise ValueError(f"unknown XP source {source}")
    amount = int(amount)
    if amount <= 0:
        return 0
    if session.scalar(select(XpTransaction.id).where(XpTransaction.user_id == user_id, XpTransaction.source == source, XpTransaction.source_id == source_id)):
        return 0
    try:
        with session.begin_nested():
            session.add(XpTransaction(id=str(uuid.uuid4()), user_id=user_id, amount=amount, source=source, source_id=source_id, meta=meta or {}, local_date=day))
            session.flush()
    except IntegrityError:
        return 0  # a concurrent request paid it first
    stats = aggregates.lock_stats(session, user_id)
    stats.total_xp += amount
    aggregates.daily(session, user_id, day).xp += amount
    return amount


def earned_today(session: Session, user_id: str, source: str, day: date) -> int:
    return int(session.scalar(select(func.coalesce(func.sum(XpTransaction.amount), 0)).where(XpTransaction.user_id == user_id, XpTransaction.source == source, XpTransaction.local_date == day)) or 0)


def award_capped(session: Session, user_id: str, amount: int, cap: int, source: str, source_id: str, day: date, meta: dict | None = None) -> int:
    """Like award(), but never lets `source` exceed `cap` XP on `day`."""
    room = max(0, cap - earned_today(session, user_id, source, day))
    return award(session, user_id, min(amount, room), source, source_id, day, {**(meta or {}), "requested": amount, "dailyCap": cap})

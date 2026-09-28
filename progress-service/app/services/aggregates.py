"""Row access for the derived aggregates (user_stats, daily_progress).

Always lock the user's stats row first (lock_stats) before touching their aggregates: that
serialises concurrent writes for one user (Postgres FOR UPDATE; SQLite is single-writer anyway).
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DailyProgress, UserStats


def lock_stats(session: Session, user_id: str) -> UserStats:
    stats = session.scalar(select(UserStats).where(UserStats.user_id == user_id).with_for_update())
    if stats is None:
        stats = UserStats(user_id=user_id)
        session.add(stats)
        session.flush()
    return stats


def daily(session: Session, user_id: str, day: date) -> DailyProgress:
    row = session.get(DailyProgress, (user_id, day))
    if row is None:
        row = DailyProgress(user_id=user_id, local_date=day, xp=0, steps=0, workouts=0, workout_minutes=0, active_minutes=0, distance_km=0, calories=0, challenges_completed=0, goals_completed=0)
        session.add(row)
        session.flush()
    return row

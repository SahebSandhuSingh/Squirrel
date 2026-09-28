"""Daily goals and streaks (server-side, in the user's own timezone).

Streak definition: a local calendar day *qualifies* when the user completes at least
STREAK_MIN_GOALS daily goals on it. The current streak is the number of consecutive qualifying
days ending today or yesterday (today isn't over yet, so yesterday keeps the streak alive).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActivityEvent, DailyProgress, UserStats
from app.rules import DAILY_GOAL_COMPLETED, DAILY_GOALS, STREAK_MILESTONES, STREAK_MIN_GOALS, UNITS, XpSource
from app.services import aggregates, xp
from app.timeutil import day_bounds_utc


def evaluate_goals(session: Session, user_id: str, tz: str, day: date) -> list[str]:
    """Award every newly met goal for `day` (once each), then update the streak. Returns goal ids met now."""
    row = aggregates.daily(session, user_id, day)
    newly: list[str] = []
    for goal in DAILY_GOALS:
        if getattr(row, goal["field"]) < goal["target"]:
            continue
        if xp.award(session, user_id, goal["xp"], XpSource.DAILY_GOAL, f"{day.isoformat()}:{goal['id']}", day, {"goal": goal["id"]}):
            row.goals_completed += 1
            newly.append(goal["id"])
            start, _ = day_bounds_utc(day, tz)
            session.add(ActivityEvent(
                id=str(uuid.uuid4()), user_id=user_id, type=DAILY_GOAL_COMPLETED, value=1, delta=1, minutes=0, area_km2=0,
                unit=UNITS[DAILY_GOAL_COMPLETED], source="system", idempotency_key=f"goal:{day.isoformat()}:{goal['id']}",
                meta={"goal": goal["id"]}, occurred_at=start, local_date=day,
            ))
    if newly and row.goals_completed >= STREAK_MIN_GOALS:
        update_streak(session, user_id, day)
    return newly


def update_streak(session: Session, user_id: str, day: date) -> None:
    stats = aggregates.lock_stats(session, user_id)
    last = stats.last_streak_date
    if last == day:
        return
    if last is None or day > last:
        stats.current_streak = stats.current_streak + 1 if last == day - timedelta(days=1) else 1
        stats.last_streak_date = day
        stats.longest_streak = max(stats.longest_streak, stats.current_streak)
        bonus = STREAK_MILESTONES.get(stats.current_streak)
        if bonus:
            xp.award(session, user_id, bonus, XpSource.STREAK, f"{stats.current_streak}:{day.isoformat()}", day, {"streak": stats.current_streak})
        return
    # A late (offline) event qualified an earlier day: rebuild from history instead of guessing.
    recompute_streak(session, stats)


def recompute_streak(session: Session, stats: UserStats) -> None:
    days = session.scalars(
        select(DailyProgress.local_date).where(DailyProgress.user_id == stats.user_id, DailyProgress.goals_completed >= STREAK_MIN_GOALS).order_by(DailyProgress.local_date)
    ).all()
    longest = run = 0
    prev: date | None = None
    for d in days:
        run = run + 1 if prev and d == prev + timedelta(days=1) else 1
        longest = max(longest, run)
        prev = d
    stats.current_streak = run if prev else 0
    stats.last_streak_date = prev
    stats.longest_streak = max(stats.longest_streak, longest)


def effective_streak(stats: UserStats, today: date) -> tuple[int, str]:
    """(current streak as of today, today's status: done | at_risk | none)."""
    last = stats.last_streak_date
    if last == today:
        return stats.current_streak, "done"
    if last == today - timedelta(days=1):
        return stats.current_streak, "at_risk"
    return 0, "none"

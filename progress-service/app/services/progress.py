"""Read models for Your Progress: lifetime, daily, weekly (+ previous week), history.

Nothing here writes. Missing days are zero-filled so charts get a continuous series.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.levels import level_info
from app.models import DailyProgress, User, UserStats, XpTransaction
from app.rules import DAILY_GOALS
from app.services.goals import effective_streak
from app.timeutil import local_today, week_start

FIELDS = ("xp", "steps", "workouts", "workout_minutes", "active_minutes", "distance_km", "calories", "challenges_completed", "goals_completed")


def _row_dict(day: date, r: DailyProgress | None) -> dict:
    g = (lambda f: getattr(r, f) if r else 0)
    return {
        "date": day.isoformat(),
        "xp": int(g("xp")),
        "steps": int(g("steps")),
        "workouts": int(g("workouts")),
        "workoutMinutes": round(float(g("workout_minutes")), 1),
        "activeMinutes": round(float(g("active_minutes")), 1),
        "distanceKm": round(float(g("distance_km")), 2),
        "calories": int(g("calories")),
        "challengesCompleted": int(g("challenges_completed")),
        "goalsCompleted": int(g("goals_completed")),
    }


def _rows(session: Session, user_id: str, start: date, end: date) -> dict[date, DailyProgress]:
    rows = session.scalars(select(DailyProgress).where(DailyProgress.user_id == user_id, DailyProgress.local_date >= start, DailyProgress.local_date <= end)).all()
    return {r.local_date: r for r in rows}


def _stats(session: Session, user_id: str) -> UserStats:
    return session.get(UserStats, user_id) or UserStats(user_id=user_id, total_xp=0, total_workouts=0, total_workout_minutes=0, total_active_minutes=0, total_steps=0, total_distance_km=0, total_calories=0, challenges_completed=0, current_streak=0, longest_streak=0)


def streak_block(stats: UserStats, today: date) -> dict:
    current, status = effective_streak(stats, today)
    return {"current": current, "longest": stats.longest_streak, "lastQualifyingDate": stats.last_streak_date.isoformat() if stats.last_streak_date else None, "todayStatus": status}


def daily(session: Session, user: User, day: date | None = None) -> dict:
    today = local_today(user.timezone)
    day = day or today
    r = session.get(DailyProgress, (user.id, day))
    out = _row_dict(day, r)
    out["goals"] = [
        {"id": g["id"], "label": g["label"], "current": getattr(r, g["field"]) if r else 0, "target": g["target"], "xp": g["xp"], "completed": bool(r and getattr(r, g["field"]) >= g["target"])}
        for g in DAILY_GOALS
    ]
    out["goalsTotal"] = len(DAILY_GOALS)
    out["streak"] = streak_block(_stats(session, user.id), today)
    out["isToday"] = day == today
    return out


def _sum(rows: dict[date, DailyProgress], start: date, days: int) -> dict:
    tot = {k: 0.0 for k in FIELDS}
    active = 0
    for i in range(days):
        r = rows.get(start + timedelta(days=i))
        if r:
            for k in FIELDS:
                tot[k] += getattr(r, k)
            if r.goals_completed > 0 or r.workouts > 0 or r.active_minutes > 0 or r.steps > 0:
                active += 1
    return {
        "xp": int(tot["xp"]), "steps": int(tot["steps"]), "workouts": int(tot["workouts"]),
        "workoutMinutes": round(tot["workout_minutes"], 1), "activeMinutes": round(tot["active_minutes"], 1),
        "distanceKm": round(tot["distance_km"], 2), "calories": int(tot["calories"]),
        "challengesCompleted": int(tot["challenges_completed"]), "goalsCompleted": int(tot["goals_completed"]), "activeDays": active,
    }


def _change(cur: float, prev: float) -> float | None:
    if prev == 0:
        return None
    return round((cur - prev) / prev, 4)


def weekly(session: Session, user: User, start: date | None = None) -> dict:
    today = local_today(user.timezone)
    start = week_start(start or today)
    prev_start = start - timedelta(days=7)
    rows = _rows(session, user.id, prev_start, start + timedelta(days=6))
    cur = _sum(rows, start, 7)
    prev = _sum(rows, prev_start, 7)
    stats = _stats(session, user.id)
    return {
        "weekStart": start.isoformat(),
        "weekEnd": (start + timedelta(days=6)).isoformat(),
        **cur,
        "streak": streak_block(stats, today),
        "previous": prev,
        "change": {k: _change(cur[k], prev[k]) for k in ("xp", "steps", "workouts", "workoutMinutes", "activeMinutes", "challengesCompleted")},
        "days": [_row_dict(start + timedelta(days=i), rows.get(start + timedelta(days=i))) for i in range(7)],
    }


def history(session: Session, user: User, start: date, end: date) -> dict:
    rows = _rows(session, user.id, start, end)
    n = (end - start).days + 1
    return {"from": start.isoformat(), "to": end.isoformat(), "days": [_row_dict(start + timedelta(days=i), rows.get(start + timedelta(days=i))) for i in range(n)]}


def lifetime(session: Session, user: User) -> dict:
    stats = _stats(session, user.id)
    today = local_today(user.timezone)
    return {
        "userId": user.id,
        "timezone": user.timezone,
        "totalXp": int(stats.total_xp),
        "level": level_info(int(stats.total_xp)),
        "totalWorkouts": stats.total_workouts,
        "totalWorkoutMinutes": round(stats.total_workout_minutes, 1),
        "totalActiveMinutes": round(stats.total_active_minutes, 1),
        "totalSteps": int(stats.total_steps),
        "totalDistanceKm": round(stats.total_distance_km, 2),
        "totalCalories": int(stats.total_calories),
        "challengesCompleted": stats.challenges_completed,
        "streak": streak_block(stats, today),
        "today": daily(session, user, today),
    }


def xp_summary(session: Session, user: User) -> dict:
    stats = _stats(session, user.id)
    today = local_today(user.timezone)
    ws = week_start(today)
    week = int(session.scalar(
        select(func.coalesce(func.sum(DailyProgress.xp), 0)).where(DailyProgress.user_id == user.id, DailyProgress.local_date >= ws, DailyProgress.local_date <= today)
    ) or 0)
    today_row = session.get(DailyProgress, (user.id, today))
    by_source = session.execute(select(XpTransaction.source, func.sum(XpTransaction.amount)).where(XpTransaction.user_id == user.id).group_by(XpTransaction.source)).all()
    return {
        "totalXp": int(stats.total_xp),
        "level": level_info(int(stats.total_xp)),
        "today": int(today_row.xp) if today_row else 0,
        "week": week,
        "bySource": {s: int(a) for s, a in by_source},
    }

"""Activity ingestion: validate → store (idempotently) → update aggregates → XP → goals/streak → challenges.

Everything for one event happens in one DB transaction (the caller commits), under a lock on the
user's stats row. Replaying an event (same idempotency key) is a no-op that returns the original.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ActivityEvent, User
from app.rules import (
    CLIENT_TYPES,
    CLOCK_SKEW_SECONDS,
    MAX_DAILY_STEPS,
    MAX_DAILY_WORKOUT_MINUTES,
    MAX_RUN_KM,
    MAX_WORKOUT_MINUTES,
    MAX_WORKOUT_REPS,
    RUN_COMPLETED,
    RUN_DAILY_CAP,
    STEP_COUNT,
    TRUSTED_TYPES,
    UNITS,
    WORKOUT_COMPLETED,
    WORKOUT_DAILY_CAP,
    XpSource,
    run_xp,
    workout_xp,
)
from app.services import aggregates, challenges, goals, xp
from app.timeutil import as_utc, local_date, utcnow


class ActivityRejected(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass
class ActivityInput:
    idempotency_key: str
    type: str
    value: float
    occurred_at: datetime
    metadata: dict = field(default_factory=dict)


@dataclass
class ActivityResult:
    event: ActivityEvent
    duplicate: bool
    xp_awarded: int = 0
    goals_completed: list[str] = field(default_factory=list)
    challenges_completed: list[str] = field(default_factory=list)


def _num(meta: dict, key: str, lo: float, hi: float) -> float | None:
    v = meta.get(key)
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
        raise ActivityRejected("invalid_metadata", f"metadata.{key} must be a number between {lo} and {hi}")
    return float(v)


def validate(inp: ActivityInput, trusted: bool, now: datetime) -> dict:
    """Bounds + type checks. Returns cleaned metadata. Raises ActivityRejected."""
    allowed = TRUSTED_TYPES if trusted else CLIENT_TYPES
    if inp.type not in allowed:
        raise ActivityRejected("type_not_allowed", f"{inp.type} can't be submitted by {'this service' if trusted else 'the app'}")
    if not inp.idempotency_key or len(inp.idempotency_key) > 120:
        raise ActivityRejected("invalid_idempotency_key", "idempotencyKey is required (≤120 chars)")
    occurred = as_utc(inp.occurred_at)
    if occurred > now + timedelta(seconds=CLOCK_SKEW_SECONDS):
        raise ActivityRejected("future_timestamp", "occurredAt is in the future")
    if occurred < now - timedelta(days=settings.offline_sync_window_days):
        raise ActivityRejected("too_old", f"occurredAt is older than {settings.offline_sync_window_days} days")
    meta = dict(inp.metadata or {})
    if inp.type == STEP_COUNT:
        if not 0 <= inp.value <= MAX_DAILY_STEPS or inp.value != int(inp.value):
            raise ActivityRejected("invalid_value", f"steps must be a whole number between 0 and {MAX_DAILY_STEPS}")
        return {}
    if inp.type == WORKOUT_COMPLETED:
        if not 0 < inp.value <= MAX_WORKOUT_MINUTES:
            raise ActivityRejected("invalid_value", f"workout minutes must be between 0 and {MAX_WORKOUT_MINUTES}")
        reps = _num(meta, "reps", 0, MAX_WORKOUT_REPS)
        kcal = _num(meta, "calories", 0, 3000)
        exercise = meta.get("exercise")
        if exercise is not None and (not isinstance(exercise, str) or len(exercise) > 40):
            raise ActivityRejected("invalid_metadata", "metadata.exercise must be a short string")
        session_id = meta.get("sessionId")
        clean = {"exercise": exercise, "reps": int(reps) if reps is not None else None, "calories": int(kcal) if kcal is not None else None, "sessionId": str(session_id)[:80] if session_id else None}
        return {k: v for k, v in clean.items() if v is not None}
    if inp.type == RUN_COMPLETED:
        if not 0 < inp.value <= MAX_RUN_KM:
            raise ActivityRejected("invalid_value", f"run distance must be between 0 and {MAX_RUN_KM} km")
        minutes = _num(meta, "minutes", 0, 24 * 60)
        area = _num(meta, "territoryM2", 0, 50_000_000)
        return {"minutes": minutes or 0, "territoryM2": area or 0, "runId": str(meta.get("runId") or "")[:80]}
    raise ActivityRejected("type_not_allowed", inp.type)


def record(session: Session, user: User, inp: ActivityInput, *, source: str, trusted: bool = False, now: datetime | None = None) -> ActivityResult:
    now = now or utcnow()
    existing = session.scalar(select(ActivityEvent).where(ActivityEvent.user_id == user.id, ActivityEvent.idempotency_key == inp.idempotency_key))
    if existing:
        return ActivityResult(event=existing, duplicate=True)
    meta = validate(inp, trusted, now)
    occurred = as_utc(inp.occurred_at)
    day = local_date(occurred, user.timezone)

    stats = aggregates.lock_stats(session, user.id)  # serialise this user's writes
    row = aggregates.daily(session, user.id, day)

    ev = ActivityEvent(id=str(uuid.uuid4()), user_id=user.id, type=inp.type, value=float(inp.value), delta=0, minutes=0, area_km2=0,
                       unit=UNITS[inp.type], source=source, idempotency_key=inp.idempotency_key, meta=meta, occurred_at=occurred, local_date=day)
    xp_awarded = 0
    if inp.type == STEP_COUNT:
        # Pedometers report a running daily total; only the increase counts, so re-sends can't inflate.
        delta = max(0, int(inp.value) - row.steps)
        ev.delta = delta
        row.steps += delta
        stats.total_steps += delta
    elif inp.type == WORKOUT_COMPLETED:
        done_today = session.scalar(select(func.coalesce(func.sum(ActivityEvent.minutes), 0)).where(
            ActivityEvent.user_id == user.id, ActivityEvent.type == WORKOUT_COMPLETED, ActivityEvent.local_date == day)) or 0
        if done_today + inp.value > MAX_DAILY_WORKOUT_MINUTES:
            raise ActivityRejected("daily_limit", f"more than {MAX_DAILY_WORKOUT_MINUTES} workout minutes in one day")
        ev.delta = 1
        ev.minutes = float(inp.value)
        row.workouts += 1
        row.workout_minutes += inp.value
        row.active_minutes += inp.value
        row.calories += meta.get("calories", 0)
        stats.total_workouts += 1
        stats.total_workout_minutes += inp.value
        stats.total_active_minutes += inp.value
        stats.total_calories += meta.get("calories", 0)
    elif inp.type == RUN_COMPLETED:
        ev.delta = float(inp.value)
        ev.minutes = float(meta["minutes"])
        ev.area_km2 = meta["territoryM2"] / 1_000_000
        row.distance_km += inp.value
        row.active_minutes += meta["minutes"]
        stats.total_distance_km += inp.value
        stats.total_active_minutes += meta["minutes"]

    session.add(ev)
    session.flush()  # unique (user, idempotency_key) enforced here too

    if inp.type == WORKOUT_COMPLETED:
        xp_awarded += xp.award_capped(session, user.id, workout_xp(inp.value, meta.get("reps")), WORKOUT_DAILY_CAP, XpSource.WORKOUT, ev.id, day, {"exercise": meta.get("exercise")})
    elif inp.type == RUN_COMPLETED:
        xp_awarded += xp.award_capped(session, user.id, run_xp(inp.value, meta["territoryM2"] > 0), RUN_DAILY_CAP, XpSource.RUN, ev.id, day, {"runId": meta["runId"]})

    before = stats.total_xp
    met = goals.evaluate_goals(session, user.id, user.timezone, day)
    done = challenges.on_activity(session, user, ev, now)
    xp_awarded += stats.total_xp - before
    return ActivityResult(event=ev, duplicate=False, xp_awarded=xp_awarded, goals_completed=met, challenges_completed=done)

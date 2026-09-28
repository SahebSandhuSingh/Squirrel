"""Challenges: participation, progress (derived from activity_events), completion, resolution.

- Progress is always *recomputed* from the activity log for the challenge window, never
  incremented from client numbers.
- Individual completion (daily/special) and group completion happen inside the activity's
  transaction; head-to-head results are only decided by resolve_due() after the window closes
  (plus a grace period for offline sync). The client can't declare anything.
- Every reward goes through the XP engine with source_id = challenge id → paid at most once.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.levels import calculate_level
from app.models import ActivityEvent, Challenge, ChallengeParticipant, User, UserStats
from app.rules import (
    CHALLENGE_COMPLETED,
    DAILY_TEMPLATES,
    H2H_MAX_HOURS,
    H2H_MAX_OPEN_PER_USER,
    H2H_METRICS,
    H2H_TIE_XP,
    H2H_WIN_XP,
    METRICS,
    RUN_COMPLETED,
    STEP_COUNT,
    UNITS,
    WORKOUT_COMPLETED,
    XpSource,
)
from app.services import aggregates, xp
from app.timeutil import as_utc, local_today, utcnow, widest_day_bounds_utc

KINDS = {"daily", "head_to_head", "group", "special"}
LIVE = ("active", "invited")          # participant states that still count toward a result
FINISHED_CHALLENGE = ("resolved", "cancelled")

#: which activity types move which metric
METRIC_TYPES = {
    "steps": {STEP_COUNT},
    "workouts": {WORKOUT_COMPLETED},
    "workout_minutes": {WORKOUT_COMPLETED},
    "active_minutes": {WORKOUT_COMPLETED, RUN_COMPLETED},
    "distance_km": {RUN_COMPLETED},
    "territory_km2": {RUN_COMPLETED},
}


class ChallengeError(Exception):
    def __init__(self, status: int, code: str, detail: str):
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail


# ---------------------------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------------------------

def _window_filter(c: Challenge):
    if c.window == "local_day":
        return ActivityEvent.local_date == c.local_date
    return and_(ActivityEvent.occurred_at >= c.starts_at, ActivityEvent.occurred_at < c.ends_at)


def metric_value(session: Session, c: Challenge, user_id: str) -> float:
    """The user's value for the challenge metric inside its window, from the activity log."""
    base = [ActivityEvent.user_id == user_id, _window_filter(c)]
    m = c.metric
    if m == "steps":
        expr, types = func.sum(ActivityEvent.delta), [STEP_COUNT]
    elif m == "workouts":
        expr, types = func.count(ActivityEvent.id), [WORKOUT_COMPLETED]
    elif m == "workout_minutes":
        expr, types = func.sum(ActivityEvent.minutes), [WORKOUT_COMPLETED]
    elif m == "active_minutes":
        expr, types = func.sum(ActivityEvent.minutes), [WORKOUT_COMPLETED, RUN_COMPLETED]
    elif m == "distance_km":
        expr, types = func.sum(ActivityEvent.delta), [RUN_COMPLETED]
    elif m == "territory_km2":
        expr, types = func.sum(ActivityEvent.area_km2), [RUN_COMPLETED]
    else:
        raise ValueError(f"unknown metric {m}")
    v = session.scalar(select(func.coalesce(expr, 0)).where(*base, ActivityEvent.type.in_(types)))
    return round(float(v or 0), 4)


def collective(session: Session, c: Challenge) -> float:
    return float(session.scalar(select(func.coalesce(func.sum(ChallengeParticipant.contribution), 0)).where(
        ChallengeParticipant.challenge_id == c.id, ChallengeParticipant.status.notin_(("left", "cancelled")))) or 0)


def participants_count(session: Session, c: Challenge) -> int:
    return int(session.scalar(select(func.count()).select_from(ChallengeParticipant).where(
        ChallengeParticipant.challenge_id == c.id, ChallengeParticipant.status.notin_(("left", "cancelled", "invited")))) or 0)


def _refresh(session: Session, c: Challenge, p: ChallengeParticipant, now: datetime) -> None:
    value = metric_value(session, c, p.user_id)
    if value != p.progress:
        p.last_progress_at = now
    p.progress = value
    p.contribution = value


# ---------------------------------------------------------------------------------------------
# Completion
# ---------------------------------------------------------------------------------------------

def _count_completion(session: Session, user: User | str, c: Challenge, day: date, now: datetime) -> None:
    user_id = user if isinstance(user, str) else user.id
    stats = aggregates.lock_stats(session, user_id)
    stats.challenges_completed += 1
    aggregates.daily(session, user_id, day).challenges_completed += 1
    session.add(ActivityEvent(
        id=str(uuid.uuid4()), user_id=user_id, type=CHALLENGE_COMPLETED, value=1, delta=1, minutes=0, area_km2=0,
        unit=UNITS[CHALLENGE_COMPLETED], source="system", idempotency_key=f"challenge:{c.id}",
        meta={"challengeId": c.id, "kind": c.kind}, occurred_at=now, local_date=day,
    ))


def _complete_individual(session: Session, user: User, c: Challenge, p: ChallengeParticipant, now: datetime) -> bool:
    if p.status != "active" or c.target is None or p.progress < c.target:
        return False
    p.status = "completed"
    p.completed_at = now
    day = c.local_date if c.window == "local_day" else local_today(user.timezone, now)
    xp.award(session, user.id, c.xp_reward, XpSource.CHALLENGE, c.id, day, {"title": c.title, "kind": c.kind})
    _count_completion(session, user, c, day, now)
    return True


def _complete_group(session: Session, c: Challenge, now: datetime) -> bool:
    locked = session.scalar(select(Challenge).where(Challenge.id == c.id).with_for_update())
    if locked.status != "active" or c.target is None or collective(session, locked) < c.target:
        return False
    locked.status = "completed"
    locked.completed_at = now
    members = session.scalars(select(ChallengeParticipant).where(ChallengeParticipant.challenge_id == c.id, ChallengeParticipant.status == "active")).all()
    for p in members:
        p.status = "completed"
        p.completed_at = now
        if p.contribution > 0:  # contributors are rewarded; passengers get the badge, not the XP
            member = session.get(User, p.user_id)
            day = local_today(member.timezone, now)
            xp.award(session, p.user_id, c.xp_reward, XpSource.GROUP_CHALLENGE, c.id, day, {"title": c.title, "contribution": p.contribution})
            _count_completion(session, member, c, day, now)
    return True


def _evaluate(session: Session, user: User, c: Challenge, p: ChallengeParticipant, now: datetime) -> bool:
    if c.kind in ("daily", "special"):
        return _complete_individual(session, user, c, p, now)
    if c.kind == "group":
        return _complete_group(session, c, now)
    return False  # head-to-head waits for resolve_due()


def on_activity(session: Session, user: User, ev: ActivityEvent, now: datetime) -> list[str]:
    """Refresh every open challenge this event could move; complete what's now complete."""
    types_to_metrics = [m for m, t in METRIC_TYPES.items() if ev.type in t]
    if not types_to_metrics:
        return []
    occurred = as_utc(ev.occurred_at)
    rows = session.execute(
        select(Challenge, ChallengeParticipant)
        .join(ChallengeParticipant, ChallengeParticipant.challenge_id == Challenge.id)
        .where(
            ChallengeParticipant.user_id == user.id,
            ChallengeParticipant.status == "active",
            Challenge.status.in_(("active", "completed")),
            Challenge.metric.in_(types_to_metrics),
            or_(
                and_(Challenge.window == "local_day", Challenge.local_date == ev.local_date),
                and_(Challenge.window == "absolute", Challenge.starts_at <= occurred, Challenge.ends_at > occurred),
            ),
        )
    ).all()
    done: list[str] = []
    for c, p in rows:
        _refresh(session, c, p, now)
        if _evaluate(session, user, c, p, now):
            done.append(c.id)
    return done


# ---------------------------------------------------------------------------------------------
# Participation
# ---------------------------------------------------------------------------------------------

def is_open_for(c: Challenge, user: User, now: datetime) -> tuple[bool, str | None]:
    if c.status in FINISHED_CHALLENGE:
        return False, "challenge_closed"
    if c.window == "local_day":
        today = local_today(user.timezone, now)
        if c.local_date < today:
            return False, "challenge_expired"
        if c.local_date > today:
            return False, "challenge_not_started"
        return True, None
    if as_utc(c.ends_at) <= now:
        return False, "challenge_expired"
    return True, None


def eligibility_error(session: Session, c: Challenge, user: User, lock: bool = False) -> ChallengeError | None:
    """Rules for joining a daily/group/special challenge: level, campus, capacity."""
    rules = c.rules or {}
    if rules.get("minLevel"):
        stats = aggregates.lock_stats(session, user.id) if lock else session.get(UserStats, user.id)
        total = stats.total_xp if stats else 0
        if calculate_level(total) < int(rules["minLevel"]):
            return ChallengeError(403, "not_eligible", f"reach level {rules['minLevel']} to join")
    if rules.get("campus") and rules["campus"] != user.campus:
        return ChallengeError(403, "not_eligible", f"open to {rules['campus']} only")
    if c.max_participants is not None and participants_count(session, c) >= c.max_participants:
        return ChallengeError(409, "challenge_full", "this challenge is full")
    return None


def join(session: Session, user: User, challenge_id: str, now: datetime | None = None) -> ChallengeParticipant:
    now = now or utcnow()
    c = session.scalar(select(Challenge).where(Challenge.id == challenge_id).with_for_update())
    if c is None:
        raise ChallengeError(404, "not_found", "challenge not found")
    ok, why = is_open_for(c, user, now)
    if not ok:
        raise ChallengeError(409, why, "this challenge is no longer open" if why != "challenge_not_started" else "this challenge hasn't started yet")
    if c.kind == "group" and c.status == "completed":
        raise ChallengeError(409, "already_completed", "this group challenge is already completed")
    p = session.scalar(select(ChallengeParticipant).where(ChallengeParticipant.challenge_id == c.id, ChallengeParticipant.user_id == user.id))

    if c.kind == "head_to_head":
        if p is None:
            raise ChallengeError(403, "not_eligible", "only the two players can take part in a head-to-head")
        if p.status != "invited":
            raise ChallengeError(409, "already_joined", "you're already in this challenge")
        p.status = "active"
        p.joined_at = now
        _refresh(session, c, p, now)
        return p

    if p is not None and p.status == "completed":
        raise ChallengeError(409, "already_completed", "you've already completed this challenge")
    if p is not None and p.status != "left":
        raise ChallengeError(409, "already_joined", "you're already in this challenge")
    # Rules apply to first joins and re-joins alike (a re-join takes a place again).
    err = eligibility_error(session, c, user, lock=True)
    if err:
        raise err
    if p is not None:
        p.status = "active"
        p.left_at = None
        p.joined_at = now
    else:
        p = ChallengeParticipant(id=str(uuid.uuid4()), challenge_id=c.id, user_id=user.id, status="active", progress=0, contribution=0, joined_at=now)
        session.add(p)
        try:
            with session.begin_nested():
                session.flush()
        except IntegrityError as exc:  # concurrent double-join
            raise ChallengeError(409, "already_joined", "you're already in this challenge") from exc
    # Activity already logged inside the window counts, so completion may happen right away.
    aggregates.lock_stats(session, user.id)
    _refresh(session, c, p, now)
    _evaluate(session, user, c, p, now)
    return p


def leave(session: Session, user: User, challenge_id: str, now: datetime | None = None) -> ChallengeParticipant:
    now = now or utcnow()
    c = session.scalar(select(Challenge).where(Challenge.id == challenge_id).with_for_update())
    if c is None:
        raise ChallengeError(404, "not_found", "challenge not found")
    p = session.scalar(select(ChallengeParticipant).where(ChallengeParticipant.challenge_id == c.id, ChallengeParticipant.user_id == user.id))
    if p is None or p.status not in LIVE:
        raise ChallengeError(409, "not_participating" if p is None or p.status == "left" else "already_finished", "you can't leave this challenge")
    if c.status in FINISHED_CHALLENGE:
        raise ChallengeError(409, "challenge_closed", "this challenge is already over")
    if c.kind == "head_to_head" and p.status == "invited":
        # Declining an invite cancels the duel; nobody is rewarded.
        c.status = "cancelled"
        c.resolved_at = now
        for q in session.scalars(select(ChallengeParticipant).where(ChallengeParticipant.challenge_id == c.id)).all():
            q.status = "cancelled"
        return p
    p.status = "left"  # for head-to-head this is a forfeit, decided at resolution
    p.left_at = now
    return p


def create_head_to_head(session: Session, user: User, opponent_id: str, metric: str, hours: int, now: datetime | None = None) -> Challenge:
    now = now or utcnow()
    if opponent_id == user.id:
        raise ChallengeError(422, "invalid_opponent", "you can't challenge yourself")
    opponent = session.get(User, opponent_id)
    if opponent is None:
        raise ChallengeError(404, "opponent_not_found", "that player doesn't exist")
    if metric not in H2H_METRICS:
        raise ChallengeError(422, "invalid_metric", f"metric must be one of {sorted(H2H_METRICS)}")
    if not 1 <= hours <= H2H_MAX_HOURS:
        raise ChallengeError(422, "invalid_duration", f"duration must be 1–{H2H_MAX_HOURS} hours")
    open_count = session.scalar(select(func.count()).select_from(Challenge).where(
        Challenge.kind == "head_to_head", Challenge.created_by == user.id, Challenge.status == "active")) or 0
    if open_count >= H2H_MAX_OPEN_PER_USER:
        raise ChallengeError(429, "too_many_open", f"you already have {H2H_MAX_OPEN_PER_USER} open duels")
    label = {"steps": "Most steps", "active_minutes": "Most active minutes", "workouts": "Most workouts", "distance_km": "Most km"}[metric]
    span = f"{hours}h" if hours < 48 else f"{hours // 24} days"
    c = Challenge(
        id=str(uuid.uuid4()), kind="head_to_head", title=f"{label} in {span}", description=f"{user.display_name or 'You'} vs {opponent.display_name or 'opponent'}",
        metric=metric, target=None, unit=METRICS[metric], xp_reward=H2H_WIN_XP, xp_reward_tie=H2H_TIE_XP, window="absolute",
        starts_at=now, ends_at=now + timedelta(hours=hours), status="active", max_participants=2, rules={}, created_by=user.id, icon="sword-cross",
    )
    session.add(c)
    session.flush()
    session.add_all([
        ChallengeParticipant(id=str(uuid.uuid4()), challenge_id=c.id, user_id=user.id, status="active", progress=0, contribution=0, joined_at=now),
        ChallengeParticipant(id=str(uuid.uuid4()), challenge_id=c.id, user_id=opponent_id, status="invited", progress=0, contribution=0),
    ])
    session.flush()
    return c


# ---------------------------------------------------------------------------------------------
# Daily generation + resolution (jobs; also run lazily from the API)
# ---------------------------------------------------------------------------------------------

def ensure_daily(session: Session, day: date) -> None:
    """Create the day's daily challenges from templates (idempotent: unique (code, local_date))."""
    have = set(session.scalars(select(Challenge.code).where(Challenge.local_date == day, Challenge.kind == "daily")).all())
    start, end = widest_day_bounds_utc(day)
    for t in DAILY_TEMPLATES:
        if t["code"] in have:
            continue
        try:
            with session.begin_nested():
                session.add(Challenge(
                    id=f"{t['code']}:{day.isoformat()}", kind="daily", code=t["code"], title=t["title"], description=t["description"],
                    metric=t["metric"], target=t["target"], unit=METRICS[t["metric"]], xp_reward=t["xp"], window="local_day",
                    local_date=day, starts_at=start, ends_at=end, status="active", rules={}, icon=t["icon"],
                ))
                session.flush()
        except IntegrityError:
            pass  # created concurrently


def resolve_due(session: Session, now: datetime | None = None, limit: int = 200) -> list[str]:
    """Close challenges whose window (plus the offline-sync grace) has passed. Idempotent."""
    now = now or utcnow()
    cutoff = now - timedelta(minutes=settings.challenge_resolve_grace_minutes)
    q = select(Challenge).where(Challenge.status.in_(("active", "completed")), Challenge.ends_at <= cutoff).order_by(Challenge.ends_at).limit(limit)
    if session.bind.dialect.name == "postgresql":
        q = q.with_for_update(skip_locked=True)
    resolved: list[str] = []
    for c in session.scalars(q).all():
        members = session.scalars(select(ChallengeParticipant).where(ChallengeParticipant.challenge_id == c.id)).all()
        if c.kind == "head_to_head":
            _resolve_h2h(session, c, members, now)
        else:
            for p in members:
                if p.status == "active":
                    user = session.get(User, p.user_id)
                    _refresh(session, c, p, now)
                    if c.kind in ("daily", "special") and _complete_individual(session, user, c, p, now):
                        continue
                    p.status = "failed"
            if c.kind == "group" and c.status == "active":
                _complete_group(session, c, now)  # last chance with the final numbers
        if c.status != "cancelled":
            c.status = "resolved"
        c.resolved_at = now
        resolved.append(c.id)
    session.flush()
    return resolved


def _resolve_h2h(session: Session, c: Challenge, members: list[ChallengeParticipant], now: datetime) -> None:
    if any(p.status == "invited" for p in members) or len(members) != 2:
        c.status = "cancelled"  # never accepted: no result, no XP
        for p in members:
            p.status = "cancelled"
        return
    for p in members:
        if p.status == "active":
            _refresh(session, c, p, now)
    a, b = members
    stayed = [p for p in members if p.status != "left"]
    if len(stayed) == 1:
        winner, loser = stayed[0], next(p for p in members if p is not stayed[0])
    elif len(stayed) == 0:
        for p in members:
            p.status = "lost"
        return
    elif abs(a.progress - b.progress) < 1e-9:
        for p in members:
            p.status = "tied"
            p.completed_at = now
            u = session.get(User, p.user_id)
            day = local_today(u.timezone, now)
            xp.award(session, p.user_id, c.xp_reward_tie, XpSource.H2H_TIE, c.id, day, {"title": c.title})
            _count_completion(session, u, c, day, now)
        return
    else:
        winner, loser = (a, b) if a.progress > b.progress else (b, a)
    winner.status = "won"
    winner.completed_at = now
    loser.status = "lost" if loser.status != "left" else "left"
    c.winner_user_id = winner.user_id
    u = session.get(User, winner.user_id)
    day = local_today(u.timezone, now)
    xp.award(session, winner.user_id, c.xp_reward, XpSource.H2H_WIN, c.id, day, {"title": c.title, "score": winner.progress, "opponentScore": loser.progress})
    _count_completion(session, u, c, day, now)


def status_for(c: Challenge, user: User, now: datetime) -> str:
    """Status as the user sees it: upcoming | active | completed | ended | cancelled."""
    if c.status == "cancelled":
        return "cancelled"
    if c.window == "local_day":
        today = local_today(user.timezone, now)
        return "active" if c.local_date == today and c.status in ("active", "completed") else ("upcoming" if c.local_date > today else "ended")
    if as_utc(c.starts_at) > now:
        return "upcoming"
    if c.status == "resolved" or as_utc(c.ends_at) <= now:
        return "ended"
    return "completed" if c.status == "completed" else "active"


__all__ = ["ChallengeError", "KINDS", "collective", "create_head_to_head", "ensure_daily", "join", "leave", "metric_value", "on_activity", "resolve_due", "status_for"]

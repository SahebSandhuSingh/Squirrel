"""HTTP API (all under /v1, bearer-authenticated; /internal/v1 needs X-Service-Key)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.views import challenge_views, progress_block
from app.auth import current_user, ensure_user, require_service_key
from app.db import get_session
from app.levels import level_info
from app.models import ActivityEvent, Challenge, ChallengeParticipant, Follow, User, XpTransaction
from app.rules import MAX_EVENTS_PER_BATCH, METRICS
from app.services import activities, challenges as ch, leaderboards as lb, progress as prog
from app.services.activities import ActivityInput, ActivityRejected
from app.services.challenges import ChallengeError
from app.timeutil import local_today, utcnow, valid_timezone

router = APIRouter(prefix="/v1")
internal = APIRouter(prefix="/internal/v1", dependencies=[Depends(require_service_key)])


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, detail: str):
        super().__init__(status_code=status, detail={"code": code, "detail": detail})


# ------------------------------------------------------------------------------------------ me

class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    displayName: str | None = Field(default=None, min_length=1, max_length=80)
    avatarUrl: str | None = Field(default=None, max_length=500)
    campus: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)


def _me(u: User) -> dict:
    return {"userId": u.id, "displayName": u.display_name, "avatarUrl": u.avatar_url, "campus": u.campus, "timezone": u.timezone}


@router.get("/me")
def get_me(user: User = Depends(current_user)) -> dict:
    return _me(user)


@router.patch("/me")
def patch_me(body: ProfilePatch, user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    if body.timezone is not None and not valid_timezone(body.timezone):
        raise ApiError(422, "invalid_timezone", "timezone must be an IANA name like Asia/Kolkata")
    for field, attr in (("displayName", "display_name"), ("avatarUrl", "avatar_url"), ("campus", "campus"), ("timezone", "timezone")):
        v = getattr(body, field)
        if v is not None:
            setattr(user, attr, v)
    session.commit()
    return _me(user)


@router.put("/me/following/{user_id}", status_code=204)
def follow(user_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)) -> None:
    if user_id == user.id:
        raise ApiError(422, "invalid_user", "you can't follow yourself")
    if session.get(User, user_id) is None:
        raise ApiError(404, "user_not_found", "user not found")
    if session.get(Follow, (user.id, user_id)) is None:
        session.add(Follow(follower_id=user.id, followee_id=user_id))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()


@router.delete("/me/following/{user_id}", status_code=204)
def unfollow(user_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)) -> None:
    f = session.get(Follow, (user.id, user_id))
    if f:
        session.delete(f)
        session.commit()


# ------------------------------------------------------------------------------------ progress

@router.get("/progress")
def get_progress(user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    return prog.lifetime(session, user)


@router.get("/progress/daily")
def get_daily(date_: date | None = Query(default=None, alias="date"), user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    return prog.daily(session, user, date_)


@router.get("/progress/weekly")
def get_weekly(week_start: date | None = Query(default=None, alias="weekStart"), user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    return prog.weekly(session, user, week_start)


@router.get("/progress/history")
def get_history(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=366),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> dict:
    end = to or local_today(user.timezone)
    start = from_ or end - timedelta(days=days - 1)
    if start > end or (end - start).days > 365:
        raise ApiError(422, "invalid_range", "from must be ≤ to and the range ≤ 366 days")
    return prog.history(session, user, start, end)


# ------------------------------------------------------------------------------------------ xp

@router.get("/xp")
def get_xp(user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    return prog.xp_summary(session, user)


@router.get("/xp/history")
def get_xp_history(limit: int = Query(default=50, ge=1, le=200), cursor: int = Query(default=0, ge=0), user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    rows = session.scalars(select(XpTransaction).where(XpTransaction.user_id == user.id).order_by(XpTransaction.created_at.desc(), XpTransaction.id.desc()).limit(limit + 1).offset(cursor)).all()
    items = [{"id": t.id, "amount": t.amount, "source": t.source, "sourceId": t.source_id, "metadata": t.meta, "date": t.local_date.isoformat(), "createdAt": t.created_at.isoformat()} for t in rows[:limit]]
    return {"items": items, "nextCursor": cursor + limit if len(rows) > limit else None}


@router.get("/levels/{total_xp}")
def get_level(total_xp: int) -> dict:
    if total_xp < 0:
        raise ApiError(422, "invalid_xp", "total XP can't be negative")
    return level_info(total_xp)


# ---------------------------------------------------------------------------------- activities

class ActivityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotencyKey: str = Field(min_length=1, max_length=120)
    type: str = Field(min_length=1, max_length=32)
    value: float
    occurredAt: datetime
    metadata: dict = Field(default_factory=dict)


class ActivityBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[ActivityIn] = Field(min_length=1, max_length=MAX_EVENTS_PER_BATCH)


def _ingest(session: Session, user: User, batch: ActivityBatch, *, source: str, trusted: bool) -> dict:
    results = []
    for e in batch.events:
        if e.occurredAt.tzinfo is None:
            results.append({"idempotencyKey": e.idempotencyKey, "status": "rejected", "code": "timestamp_needs_timezone", "detail": "occurredAt must include a UTC offset"})
            continue
        inp = ActivityInput(idempotency_key=e.idempotencyKey, type=e.type, value=e.value, occurred_at=e.occurredAt, metadata=e.metadata)
        try:
            r = activities.record(session, user, inp, source=source, trusted=trusted)
            session.commit()
            results.append({
                "idempotencyKey": e.idempotencyKey, "status": "duplicate" if r.duplicate else "accepted", "eventId": r.event.id,
                "xpAwarded": r.xp_awarded, "goalsCompleted": r.goals_completed, "challengesCompleted": r.challenges_completed,
            })
        except ActivityRejected as exc:
            session.rollback()
            results.append({"idempotencyKey": e.idempotencyKey, "status": "rejected", "code": exc.code, "detail": exc.detail})
        except IntegrityError:
            session.rollback()  # the same key raced in from another request
            results.append({"idempotencyKey": e.idempotencyKey, "status": "duplicate"})
    return {"results": results, "progress": prog.daily(session, user), "xp": prog.xp_summary(session, user)}


@router.post("/activities")
def post_activities(batch: ActivityBatch, user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    return _ingest(session, user, batch, source="client", trusted=False)


@router.get("/activities")
def get_activities(type_: str | None = Query(default=None, alias="type"), limit: int = Query(default=50, ge=1, le=200), cursor: int = Query(default=0, ge=0),
                   user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    q = select(ActivityEvent).where(ActivityEvent.user_id == user.id)
    if type_:
        q = q.where(ActivityEvent.type == type_)
    rows = session.scalars(q.order_by(ActivityEvent.occurred_at.desc(), ActivityEvent.id.desc()).limit(limit + 1).offset(cursor)).all()
    items = [{"id": a.id, "type": a.type, "value": a.value, "credited": a.delta, "unit": a.unit, "source": a.source, "metadata": a.meta,
              "occurredAt": a.occurred_at.isoformat(), "date": a.local_date.isoformat(), "idempotencyKey": a.idempotency_key} for a in rows[:limit]]
    return {"items": items, "nextCursor": cursor + limit if len(rows) > limit else None}


# ---------------------------------------------------------------------------------- challenges

def _raise(exc: ChallengeError):
    raise ApiError(exc.status, exc.code, exc.detail)


def _housekeeping(session: Session, user: User) -> None:
    """Lazy jobs: resolve anything due, make sure today's daily challenges exist."""
    ch.resolve_due(session)
    ch.ensure_daily(session, local_today(user.timezone))
    session.commit()


@router.get("/challenges")
def list_challenges(
    kind: Literal["daily", "head_to_head", "group", "special"] | None = None,
    status: Literal["current", "ended", "mine"] = "current",
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> dict:
    _housekeeping(session, user)
    now = utcnow()
    today = local_today(user.timezone)
    mine_ids = select(ChallengeParticipant.challenge_id).where(ChallengeParticipant.user_id == user.id)
    q = select(Challenge)
    if status == "current":
        q = q.where(
            Challenge.status.in_(("active", "completed")),
            or_(
                (Challenge.kind == "daily") & (Challenge.local_date == today),
                (Challenge.kind == "head_to_head") & Challenge.id.in_(mine_ids),
                Challenge.kind.in_(("group", "special")) & (Challenge.ends_at > now),
            ),
        )
    elif status == "ended":
        q = q.where(Challenge.id.in_(mine_ids), Challenge.status.in_(("resolved", "cancelled")))
    else:
        q = q.where(Challenge.id.in_(mine_ids))
    if kind:
        q = q.where(Challenge.kind == kind)
    rows = session.scalars(q.order_by(Challenge.ends_at, Challenge.id).limit(limit)).all()
    return {"challenges": challenge_views(session, user, rows, now)}


@router.get("/challenges/{challenge_id}")
def get_challenge(challenge_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    _housekeeping(session, user)
    c = session.get(Challenge, challenge_id)
    if c is None or (c.kind == "head_to_head" and not session.scalar(select(ChallengeParticipant.id).where(ChallengeParticipant.challenge_id == c.id, ChallengeParticipant.user_id == user.id))):
        raise ApiError(404, "not_found", "challenge not found")
    return challenge_views(session, user, [c], utcnow())[0]


@router.get("/challenges/{challenge_id}/progress")
def get_challenge_progress(challenge_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    _housekeeping(session, user)
    c = session.get(Challenge, challenge_id)
    if c is None:
        raise ApiError(404, "not_found", "challenge not found")
    p = session.scalar(select(ChallengeParticipant).where(ChallengeParticipant.challenge_id == c.id, ChallengeParticipant.user_id == user.id))
    if p is None:
        raise ApiError(404, "not_participating", "join this challenge to track progress")
    body = progress_block(c, p)
    if c.kind == "group":
        body["collective"] = ch.collective(session, c)
    return body


@router.post("/challenges/{challenge_id}/join")
def join_challenge(challenge_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    _housekeeping(session, user)
    try:
        ch.join(session, user, challenge_id)
        session.commit()
    except ChallengeError as exc:
        session.rollback()
        _raise(exc)
    return challenge_views(session, user, [session.get(Challenge, challenge_id)], utcnow())[0]


@router.post("/challenges/{challenge_id}/leave")
def leave_challenge(challenge_id: str, user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    try:
        ch.leave(session, user, challenge_id)
        session.commit()
    except ChallengeError as exc:
        session.rollback()
        _raise(exc)
    return challenge_views(session, user, [session.get(Challenge, challenge_id)], utcnow())[0]


class HeadToHeadIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    opponentId: str = Field(min_length=1, max_length=64)
    metric: str
    durationHours: int = Field(ge=1, le=168)


@router.post("/challenges/head-to-head", status_code=201)
def create_h2h(body: HeadToHeadIn, user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    try:
        c = ch.create_head_to_head(session, user, body.opponentId, body.metric, body.durationHours)
        session.commit()
    except ChallengeError as exc:
        session.rollback()
        _raise(exc)
    return challenge_views(session, user, [c], utcnow())[0]


# -------------------------------------------------------------------------------- leaderboards

@router.get("/leaderboards")
def list_leaderboards() -> dict:
    return {"types": lb.TYPES, "periods": lb.PERIODS}


@router.get("/leaderboards/{kind}")
def get_leaderboard(
    kind: str,
    period: str = "weekly",
    challenge_id: str | None = Query(default=None, alias="challengeId"),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: int = Query(default=0, ge=0),
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> dict:
    try:
        if kind in ("global", "friends", "campus"):
            return lb.xp_board(session, user, kind, period, limit, cursor)
        if kind in ("challenge", "group"):
            if not challenge_id:
                raise ApiError(422, "missing_challenge", "challengeId is required")
            return lb.challenge_board(session, user, challenge_id, limit, cursor, kind)
    except lb.LeaderboardError as exc:
        raise ApiError(exc.status, "leaderboard_error", exc.detail) from exc
    raise ApiError(404, "unknown_leaderboard", f"leaderboard type must be one of {lb.TYPES}")


# ------------------------------------------------------------------------------------ internal

class TrustedActivityBatch(ActivityBatch):
    userId: str = Field(min_length=1, max_length=64)
    source: Literal["run_module", "exercise"] = "run_module"


@internal.post("/activities")
def internal_activities(batch: TrustedActivityBatch, session: Session = Depends(get_session)) -> dict:
    user = ensure_user(session, batch.userId)
    return _ingest(session, user, ActivityBatch(events=batch.events), source=batch.source, trusted=True)


class ChallengeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str | None = Field(default=None, max_length=64)
    kind: Literal["group", "special"]
    title: str = Field(min_length=1, max_length=140)
    description: str = ""
    metric: str
    target: float = Field(gt=0)
    xpReward: int = Field(ge=0, le=5000)
    startsAt: datetime
    endsAt: datetime
    maxParticipants: int | None = Field(default=None, ge=1)
    groupName: str | None = Field(default=None, max_length=80)
    icon: str | None = Field(default=None, max_length=40)
    rules: dict = Field(default_factory=dict)


@internal.post("/challenges", status_code=201)
def internal_create_challenge(body: ChallengeIn, session: Session = Depends(get_session)) -> dict:
    import uuid

    if body.metric not in METRICS:
        raise ApiError(422, "invalid_metric", f"metric must be one of {sorted(METRICS)}")
    if body.startsAt.tzinfo is None or body.endsAt.tzinfo is None:
        raise ApiError(422, "timestamp_needs_timezone", "startsAt and endsAt must include a UTC offset")
    if body.endsAt <= body.startsAt:
        raise ApiError(422, "invalid_window", "endsAt must be after startsAt")
    c = Challenge(id=body.id or str(uuid.uuid4()), kind=body.kind, title=body.title, description=body.description, metric=body.metric,
                  target=body.target, unit=METRICS[body.metric], xp_reward=body.xpReward, window="absolute", starts_at=body.startsAt,
                  ends_at=body.endsAt, status="active", max_participants=body.maxParticipants, group_name=body.groupName, icon=body.icon, rules=body.rules)
    session.add(c)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise ApiError(409, "exists", "a challenge with that id already exists") from exc
    return {"id": c.id}


@internal.post("/jobs/resolve")
def internal_resolve(session: Session = Depends(get_session)) -> dict:
    done = ch.resolve_due(session)
    session.commit()
    return {"resolved": done}

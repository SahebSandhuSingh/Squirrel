"""Leaderboards. Scores come only from server aggregates; ranking is deterministic.

Order: score DESC, then user id ASC. Rank is the standard competition rank (ties share a rank:
1, 2, 2, 4). Periods: daily / weekly (the requester's local day / ISO week) / alltime.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, literal, select
from sqlalchemy.orm import Session

from app.models import Challenge, ChallengeParticipant, DailyProgress, Follow, User, UserStats
from app.timeutil import local_today, week_start

TYPES = ["global", "friends", "campus", "challenge", "group"]
PERIODS = ["daily", "weekly", "alltime"]


class LeaderboardError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _xp_scores(session: Session, me: User, period: str):
    """Subquery (user_id, score) of XP for the period."""
    if period == "alltime":
        return select(UserStats.user_id.label("user_id"), UserStats.total_xp.label("score")).where(UserStats.total_xp > 0)
    today = local_today(me.timezone)
    start = today if period == "daily" else week_start(today)
    end = today + timedelta(days=1) if period == "daily" else start + timedelta(days=7)
    return (
        select(DailyProgress.user_id.label("user_id"), func.sum(DailyProgress.xp).label("score"))
        .where(DailyProgress.local_date >= start, DailyProgress.local_date < end)
        .group_by(DailyProgress.user_id)
        .having(func.sum(DailyProgress.xp) > 0)
    )


def _ranked(scores, population=None):
    s = scores.subquery()
    q = select(
        s.c.user_id,
        s.c.score,
        func.rank().over(order_by=s.c.score.desc()).label("rank"),
    )
    if population is not None:
        q = q.where(s.c.user_id.in_(population))
    return q.subquery()


def xp_board(session: Session, me: User, kind: str, period: str, limit: int, offset: int) -> dict:
    if period not in PERIODS:
        raise LeaderboardError(422, f"period must be one of {PERIODS}")
    population = None
    if kind == "friends":
        population = select(Follow.followee_id).where(Follow.follower_id == me.id).union(select(literal(me.id)))
    elif kind == "campus":
        if not me.campus:
            raise LeaderboardError(409, "set your campus to see the campus leaderboard")
        population = select(User.id).where(User.campus == me.campus)
    ranked = _ranked(_xp_scores(session, me, period), population)
    rows = session.execute(
        select(ranked.c.rank, ranked.c.user_id, ranked.c.score, User.display_name, User.avatar_url)
        .join(User, User.id == ranked.c.user_id)
        .order_by(ranked.c.rank, ranked.c.user_id)
        .limit(limit)
        .offset(offset)
    ).all()
    mine = session.execute(select(ranked.c.rank, ranked.c.score).where(ranked.c.user_id == me.id)).first()
    total = session.scalar(select(func.count()).select_from(ranked)) or 0
    return {
        "type": kind,
        "period": period,
        "metric": "xp",
        "rank": mine.rank if mine else None,
        "me": {"rank": mine.rank, "xp": int(mine.score)} if mine else None,
        "users": [{"rank": r.rank, "userId": r.user_id, "name": r.display_name, "avatar": r.avatar_url, "xp": int(r.score)} for r in rows],
        "total": int(total),
        "nextCursor": offset + limit if offset + limit < total else None,
    }


def challenge_board(session: Session, me: User, challenge_id: str, limit: int, offset: int, kind: str) -> dict:
    c = session.get(Challenge, challenge_id)
    if c is None:
        raise LeaderboardError(404, "challenge not found")
    if kind == "group" and c.kind != "group":
        raise LeaderboardError(422, "not a group challenge")
    live = ChallengeParticipant.status.notin_(("left", "cancelled", "invited"))
    ranked = (
        select(
            ChallengeParticipant.user_id,
            ChallengeParticipant.contribution.label("score"),
            ChallengeParticipant.status,
            func.rank().over(order_by=ChallengeParticipant.contribution.desc()).label("rank"),
        )
        .where(ChallengeParticipant.challenge_id == c.id, live)
        .subquery()
    )
    rows = session.execute(
        select(ranked, User.display_name, User.avatar_url).join(User, User.id == ranked.c.user_id).order_by(ranked.c.rank, ranked.c.user_id).limit(limit).offset(offset)
    ).all()
    mine = session.execute(select(ranked.c.rank, ranked.c.score).where(ranked.c.user_id == me.id)).first()
    total = session.scalar(select(func.count()).select_from(ranked)) or 0
    return {
        "type": kind,
        "challengeId": c.id,
        "metric": c.metric,
        "unit": c.unit,
        "rank": mine.rank if mine else None,
        "me": {"rank": mine.rank, "score": mine.score} if mine else None,
        "users": [{"rank": r.rank, "userId": r.user_id, "name": r.display_name, "avatar": r.avatar_url, "score": r.score, "status": r.status} for r in rows],
        "total": int(total),
        "nextCursor": offset + limit if offset + limit < total else None,
    }

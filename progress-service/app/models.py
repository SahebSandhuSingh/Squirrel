"""Database schema. Mirrored exactly by migrations/versions/0001_initial.py.

Design notes
- activity_events is the append-only log everything else is derived from; (user_id, idempotency_key)
  is unique so offline re-sync can never double count.
- xp_transactions is the only way XP changes; (user_id, source, source_id) is unique so an award
  (a challenge completion, a daily goal, a workout) can happen once, no matter how often it's requested.
- daily_progress (per user per *local* day) and user_stats (lifetime) are aggregates updated in the
  same DB transaction as the event that changes them; they exist so reads/leaderboards stay O(index).
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")
TS = DateTime(timezone=True)


class User(Base):
    """A person, keyed by the auth token's `sub` (the same id the Run Module uses)."""

    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(80))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    campus: Mapped[str | None] = mapped_column(String(120), index=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), onupdate=func.now(), nullable=False)


class Follow(Base):
    __tablename__ = "follows"
    follower_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    followee_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    __table_args__ = (
        CheckConstraint("follower_id <> followee_id", name="ck_follows_not_self"),
        Index("ix_follows_followee", "followee_id"),
    )


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    #: What this event actually added (e.g. a cumulative step total of 7,000 after 5,000 adds 2,000).
    delta: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    #: Active minutes this event contributes (workouts, runs); 0 for steps.
    minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    #: Territory captured (runs, from the Run Module), km².
    area_km2: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    meta: Mapped[dict] = mapped_column("metadata", JSONType, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(TS, nullable=False)
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_activity_user_idem"),
        Index("ix_activity_user_type_time", "user_id", "type", "occurred_at"),
        Index("ix_activity_user_date", "user_id", "local_date"),
    )


class XpTransaction(Base):
    __tablename__ = "xp_transactions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str] = mapped_column(String(120), nullable=False)
    meta: Mapped[dict] = mapped_column("metadata", JSONType, nullable=False, default=dict)
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("user_id", "source", "source_id", name="uq_xp_award_once"),
        CheckConstraint("amount > 0", name="ck_xp_positive"),
        Index("ix_xp_user_created", "user_id", "created_at"),
        Index("ix_xp_date_user", "local_date", "user_id"),
    )


class DailyProgress(Base):
    """Per user per local day. Also the progress history the charts read."""

    __tablename__ = "daily_progress"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    local_date: Mapped[date] = mapped_column(Date, primary_key=True)
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    steps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    workouts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    workout_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    active_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    calories: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    challenges_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    goals_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (Index("ix_daily_date_xp", "local_date", "xp"),)


class UserStats(Base):
    """Lifetime totals + streak. One row per user; locked FOR UPDATE while an event is applied."""

    __tablename__ = "user_stats"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    total_xp: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total_workouts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_workout_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    total_active_minutes: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    total_steps: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total_distance_km: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    total_calories: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    challenges_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_streak_date: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (Index("ix_stats_total_xp", "total_xp"),)


class Challenge(Base):
    __tablename__ = "challenges"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # daily | head_to_head | group | special
    code: Mapped[str | None] = mapped_column(String(80))  # template code for generated daily challenges
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    metric: Mapped[str] = mapped_column(String(24), nullable=False)
    target: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    xp_reward_tie: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: absolute = [starts_at, ends_at); local_day = the participant's own calendar day `local_date`.
    window: Mapped[str] = mapped_column(String(16), nullable=False, default="absolute")
    local_date: Mapped[date | None] = mapped_column(Date)
    starts_at: Mapped[datetime] = mapped_column(TS, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(TS, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active | completed | resolved | cancelled
    max_participants: Mapped[int | None] = mapped_column(Integer)
    rules: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    group_name: Mapped[str | None] = mapped_column(String(80))
    icon: Mapped[str | None] = mapped_column(String(40))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    winner_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    completed_at: Mapped[datetime | None] = mapped_column(TS)
    resolved_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_challenge_window"),
        CheckConstraint("kind in ('daily','head_to_head','group','special')", name="ck_challenge_kind"),
        UniqueConstraint("code", "local_date", name="uq_challenge_daily_template"),
        Index("ix_challenge_status_end", "status", "ends_at"),
        Index("ix_challenge_kind_window", "kind", "starts_at", "ends_at"),
    )


class ChallengeParticipant(Base):
    __tablename__ = "challenge_participants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    challenge_id: Mapped[str] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    #: invited | active | completed | left | won | lost | tied | failed | cancelled
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    contribution: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    joined_at: Mapped[datetime | None] = mapped_column(TS)
    completed_at: Mapped[datetime | None] = mapped_column(TS)
    left_at: Mapped[datetime | None] = mapped_column(TS)
    last_progress_at: Mapped[datetime | None] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("challenge_id", "user_id", name="uq_participant_once"),
        Index("ix_participant_user_status", "user_id", "status"),
        Index("ix_participant_challenge_progress", "challenge_id", "progress"),
    )

"""Database model. Normalised: posts reference activities; counters are denormalised onto
`posts` and `user_stats` and only ever changed in the same transaction as the row that
justifies them (a like, a follow, a post), guarded by the unique constraints.

Privacy by construction: no email, no password, no GPS. A run becomes an `activities` row with
distance / duration only; its route and territory geometry stay in the Run Module.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    SmallInteger,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, UTCDateTime, utcnow


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class User(Base):
    """One row per authenticated account. `id` is the public profile id; `auth_subject` (the
    JWT `sub`) links to the account service and is never returned by the API."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    auth_subject: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)  # always lowercase
    username_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_name: Mapped[str] = mapped_column(String(40), nullable=False)
    bio: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    city_id: Mapped[str | None] = mapped_column(String(32))
    area: Mapped[str | None] = mapped_column(String(60))
    college: Mapped[str | None] = mapped_column(String(80))
    interests: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    avatar_look: Mapped[dict | None] = mapped_column(JSON)
    avatar_media_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("media.id", ondelete="SET NULL", use_alter=True, name="fk_users_avatar_media"))
    visibility: Mapped[str] = mapped_column(String(16), nullable=False, default="public")
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow, onupdate=utcnow)

    stats: Mapped[UserStats] = relationship(back_populates="user", uselist=False, lazy="joined")

    __table_args__ = (
        CheckConstraint("visibility IN ('public', 'private')", name="ck_users_visibility"),
        CheckConstraint("role IN ('user', 'moderator', 'admin')", name="ck_users_role"),
        Index("ix_users_city_created", "city_id", "created_at"),
    )


class UserStats(Base):
    """Hot counters kept apart from the profile row. `xp` is a read-through copy of the Run
    Module's figure (never client-supplied); `xp_synced_at` says how fresh it is."""

    __tablename__ = "user_stats"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    followers_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    following_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    posts_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    xp_synced_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship(back_populates="stats")

    __table_args__ = (
        CheckConstraint("followers_count >= 0 AND following_count >= 0 AND posts_count >= 0", name="ck_user_stats_nonneg"),
    )


class Follow(Base):
    """follower → followee. `pending` = request to a private account (not counted)."""

    __tablename__ = "follows"

    follower_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    followee_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="accepted")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        PrimaryKeyConstraint("follower_id", "followee_id", name="pk_follows"),
        CheckConstraint("follower_id <> followee_id", name="ck_follows_not_self"),
        CheckConstraint("status IN ('accepted', 'pending')", name="ck_follows_status"),
        Index("ix_follows_follower", "follower_id", "status", "created_at"),
        Index("ix_follows_followee", "followee_id", "status", "created_at"),
    )


class Activity(Base):
    """A completed workout, owned by the module that measured it. Social only keeps the summary
    needed to render a post; `source` + `source_ref` point back to the authoritative record
    (e.g. the Run Module's run_id) and are unique so one run can't become two activities."""

    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(128))
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    name: Mapped[str | None] = mapped_column(String(60))
    distance_m: Mapped[int | None] = mapped_column(Integer)
    duration_s: Mapped[int | None] = mapped_column(Integer)
    calories: Mapped[int | None] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        UniqueConstraint("source", "source_ref", name="uq_activities_source_ref"),
        CheckConstraint("type IN ('run', 'ride', 'workout', 'yoga', 'meal')", name="ck_activities_type"),
        CheckConstraint("source IN ('run_module', 'exercise', 'manual')", name="ck_activities_source"),
        Index("ix_activities_user_started", "user_id", "started_at"),
    )


class Media(Base):
    """An uploaded file in object storage. Created `pending` with a presigned PUT URL, becomes
    `ready` once the server has confirmed the object (size + content type) exists."""

    __tablename__ = "media"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose: Mapped[str] = mapped_column(String(16), nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        CheckConstraint("purpose IN ('post', 'avatar')", name="ck_media_purpose"),
        CheckConstraint("status IN ('pending', 'ready')", name="ck_media_status"),
        Index("ix_media_owner", "owner_id", "created_at"),
    )


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    author_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    caption: Mapped[str] = mapped_column(String(280), nullable=False, default="")
    activity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("activities.id", ondelete="SET NULL"), unique=True)
    media_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("media.id", ondelete="SET NULL"))
    city_id: Mapped[str | None] = mapped_column(String(32))
    area: Mapped[str | None] = mapped_column(String(60))
    backdrop_scene: Mapped[str] = mapped_column(String(24), nullable=False, default="city-sunset")
    backdrop_seed: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    sticker: Mapped[str | None] = mapped_column(String(24))
    crew_name: Mapped[str | None] = mapped_column(String(60))
    likes_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        CheckConstraint("likes_count >= 0 AND comments_count >= 0", name="ck_posts_counts_nonneg"),
        Index("ix_posts_created", "created_at", "id"),
        Index("ix_posts_author_created", "author_id", "created_at", "id"),
        Index("ix_posts_city_created", "city_id", "created_at", "id"),
    )


class PostLike(Base):
    __tablename__ = "post_likes"

    post_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        PrimaryKeyConstraint("post_id", "user_id", name="pk_post_likes"),
        Index("ix_post_likes_user", "user_id", "created_at"),
    )


class PostSave(Base):
    __tablename__ = "post_saves"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (
        PrimaryKeyConstraint("user_id", "post_id", name="pk_post_saves"),
        Index("ix_post_saves_user_created", "user_id", "created_at", "post_id"),
    )


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    post_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (Index("ix_comments_post_created", "post_id", "created_at", "id"),)


class Badge(Base):
    """Badge catalogue. `kind` names the app's badge artwork (BadgeKind)."""

    __tablename__ = "badges"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(String(160), nullable=False)


class UserBadge(Base):
    __tablename__ = "user_badges"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    badge_id: Mapped[str] = mapped_column(String(32), ForeignKey("badges.id", ondelete="CASCADE"), nullable=False)
    awarded_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, default=utcnow)

    __table_args__ = (PrimaryKeyConstraint("user_id", "badge_id", name="pk_user_badges"),)


# Seeded by the initial migration (and by tests via metadata.create_all + seed_badges).
BADGE_CATALOGUE: list[dict[str, str]] = [
    {"id": "first-run", "kind": "first-run", "title": "First Run", "description": "Shared your first verified run."},
    {"id": "first-post", "kind": "social", "title": "Say Hi", "description": "Published your first post."},
    {"id": "streak-7", "kind": "streak", "title": "7-Day Streak", "description": "Logged activity seven days in a row."},
    {"id": "crowd-favourite", "kind": "social", "title": "Crowd Favourite", "description": "A post of yours reached 50 likes."},
]

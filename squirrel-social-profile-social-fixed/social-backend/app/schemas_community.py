"""Request and response models of the community routes: membership and referrals, crews, events,
check-ins, challenges, notifications, boards and daily stats. Same conventions as schemas.py."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app import rules
from app.schemas import UserSummary

Interest = Literal["running", "walking", "cycling", "yoga", "hiit", "climbing", "nutrition", "other"]
BoardWindow = Literal["daily", "weekly"]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _clean(v: str | None) -> str | None:
    return rules.clean_text(v) if v is not None else v


def _one_line(v: str | None) -> str | None:
    v = _clean(v)
    if v is not None and "\n" in v:
        raise ValueError("Must be one line.")
    return v


# --------------------------------------------------------------------------- membership


class FoundingOut(BaseModel):
    badge_id: str
    title: str
    rank: int


class MembershipOut(BaseModel):
    position: int                 # where you joined the line
    effective_position: int       # where you are now: everyone who skipped it goes first
    members_total: int
    referral_code: str
    invite_url: str | None
    referrals: int
    referrals_to_skip: int
    skipped: bool
    admitted: bool                # everyone is, for now
    email_verified: bool
    founding: FoundingOut | None
    referred_by: UserSummary | None


class ClaimReferralRequest(_In):
    code: Annotated[str, Field(min_length=4, max_length=16)]


class CommunityConfig(BaseModel):
    hostels: list[str]
    founding_first: int
    founding_total: int
    referrals_to_skip: int
    timezone: str


# --------------------------------------------------------------------------- crews


class CreateCrewRequest(_In):
    name: Annotated[str, Field(min_length=3, max_length=40)]
    tagline: Annotated[str, Field(max_length=120)] = ""
    interest: Interest
    meets: Annotated[str, Field(max_length=60)] = ""
    scope: Literal["campus", "online"] = "campus"
    hostel: str | None = None

    @field_validator("name", "tagline", "meets")
    @classmethod
    def _one_line_fields(cls, v):
        return _one_line(v)


class CrewOut(BaseModel):
    id: uuid.UUID
    name: str
    tagline: str
    interest: str
    meets: str
    scope: str
    hostel: str | None
    members_count: int
    created_at: datetime
    is_member: bool
    my_role: str | None
    member_since: datetime | None
    preview: list[UserSummary]    # a few members, for the avatar row


class CrewPage(BaseModel):
    items: list[CrewOut]
    next_cursor: str | None


class CrewMemberOut(BaseModel):
    user: UserSummary
    role: str
    member_since: datetime
    vouches: int
    vouched_by_me: bool
    is_me: bool


class CrewDetail(CrewOut):
    members: list[CrewMemberOut]
    upcoming_events: list[EventOut]


class VouchResult(BaseModel):
    vouches: int
    vouched_by_me: bool


# --------------------------------------------------------------------------- events


class CreateEventRequest(_In):
    title: Annotated[str, Field(min_length=3, max_length=80)]
    description: Annotated[str, Field(max_length=500)] = ""
    kind: Interest
    venue: Annotated[str, Field(max_length=80)] = ""
    online: bool = False
    starts_at: datetime
    ends_at: datetime | None = None
    capacity: Annotated[int, Field(ge=2, le=1000)] | None = None
    crew_id: uuid.UUID | None = None

    @field_validator("title", "venue")
    @classmethod
    def _one_line_fields(cls, v):
        return _one_line(v)

    @field_validator("description")
    @classmethod
    def _clean_description(cls, v):
        return _clean(v)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _aware(cls, v: datetime | None):
        if v is not None and v.tzinfo is None:
            raise ValueError("Include a time zone (e.g. 2026-10-01T06:00:00+05:30).")
        return v


class EventOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    kind: str
    venue: str
    online: bool
    starts_at: datetime
    ends_at: datetime | None
    capacity: int | None
    going_count: int
    cancelled: bool
    crew: CrewRef | None
    host: UserSummary
    my_rsvp: Literal["going", "interested"] | None
    checked_in: bool
    attendees: list[UserSummary]  # a few of those going


class CrewRef(BaseModel):
    id: uuid.UUID
    name: str
    interest: str


class EventPage(BaseModel):
    items: list[EventOut]
    next_cursor: str | None


class RsvpRequest(_In):
    status: Literal["going", "interested"] = "going"


class CheckInRequest(_In):
    """Tell up to 5 friends you've arrived. A friend is someone who follows you, or shares a crew
    with you; anyone else in the list is skipped."""

    notify_user_ids: Annotated[list[uuid.UUID], Field(max_length=5)] = []
    note: Annotated[str, Field(max_length=140)] = ""

    @field_validator("note")
    @classmethod
    def _clean_note(cls, v):
        return _one_line(v)


class MeetupCheckInRequest(CheckInRequest):
    place: Annotated[str, Field(min_length=2, max_length=80)]

    @field_validator("place")
    @classmethod
    def _clean_place(cls, v):
        return _one_line(v)


class CheckInOut(BaseModel):
    id: uuid.UUID
    place: str
    event_id: uuid.UUID | None
    note: str
    notified: int
    created_at: datetime


# --------------------------------------------------------------------------- challenges


class CreateChallengeRequest(_In):
    opponent_id: uuid.UUID
    metric: Literal["km", "workouts"] = "km"
    days: Annotated[int, Field(ge=1, le=30)] = 7


class ChallengeSide(BaseModel):
    user: UserSummary
    score: float


class ChallengeOut(BaseModel):
    id: uuid.UUID
    metric: str
    days: int
    status: str
    created_at: datetime
    starts_at: datetime | None
    ends_at: datetime | None
    me: ChallengeSide
    opponent: ChallengeSide
    i_challenged: bool
    winner_id: uuid.UUID | None


class ChallengeList(BaseModel):
    items: list[ChallengeOut]


# --------------------------------------------------------------------------- notifications


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str
    data: dict
    actor: UserSummary | None
    created_at: datetime
    read: bool


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None
    unread: int


class MarkReadRequest(_In):
    ids: Annotated[list[uuid.UUID], Field(max_length=100)] | None = None  # None: all


class UnreadCount(BaseModel):
    unread: int


class PushTokenRequest(_In):
    token: Annotated[str, Field(min_length=10, max_length=255, pattern=r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$")]
    platform: Literal["ios", "android", "web"]


class InternalNotificationIn(_In):
    """From the Run Module (territory steals) or another service. The text is written here, from
    `kind` and the names Social knows."""

    user_subject: Annotated[str, Field(min_length=1, max_length=255)]
    kind: Literal["territory_lost", "territory_captured", "territory_expired"]
    actor_subject: Annotated[str, Field(min_length=1, max_length=255)] | None = None
    data: dict = {}
    dedupe_key: Annotated[str, Field(min_length=1, max_length=120)]


class InternalNotificationOut(BaseModel):
    created: bool


# --------------------------------------------------------------------------- boards & stats


class XpBoardEntry(BaseModel):
    rank: int
    xp: int
    user: UserSummary
    hostel: str | None
    is_me: bool


class XpBoard(BaseModel):
    window: BoardWindow
    day: date
    entries: list[XpBoardEntry]
    me: XpBoardEntry | None
    available: bool           # false when the Run Module could not be reached


class HostelEntry(BaseModel):
    rank: int
    hostel: str
    xp: int
    members: int
    active: int               # members who earned XP in the window
    is_mine: bool


class HostelBoard(BaseModel):
    window: BoardWindow
    day: date
    enabled: bool             # false until SOCIAL_HOSTELS is set
    entries: list[HostelEntry]
    available: bool


class DayStats(BaseModel):
    day: date
    active_members: int
    runs: int
    km: float
    workouts: int


class MyDay(BaseModel):
    runs: int
    km: float
    workouts: int


class DailyStats(BaseModel):
    timezone: str
    today: DayStats
    me_today: MyDay
    days: list[DayStats]      # newest first, today included


class MonthVerification(BaseModel):
    """"47 km this month": verified runs only (measured by the Run Module, not typed in)."""

    month: str                # YYYY-MM
    km: float
    runs: int
    workouts: int


CrewDetail.model_rebuild()
EventOut.model_rebuild()

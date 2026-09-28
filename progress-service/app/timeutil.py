"""Time helpers. All instants are stored in UTC; "days" are always the user's *local* calendar day."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime) -> datetime:
    """Aware UTC datetime. Naive values (SQLite round-trips) are treated as UTC."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def valid_timezone(name: str) -> bool:
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def local_date(instant: datetime, tz: str) -> date:
    return as_utc(instant).astimezone(ZoneInfo(tz)).date()


def local_today(tz: str, now: datetime | None = None) -> date:
    return local_date(now or utcnow(), tz)


def day_bounds_utc(day: date, tz: str) -> tuple[datetime, datetime]:
    """[start, end) of a local calendar day, in UTC (handles DST-length days)."""
    z = ZoneInfo(tz)
    start = datetime.combine(day, time.min, tzinfo=z)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=z)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def week_start(day: date) -> date:
    """ISO week: Monday."""
    return day - timedelta(days=day.weekday())


def widest_day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """UTC instant range that covers `day` in every timezone (UTC+14 … UTC−12)."""
    start = datetime.combine(day, time.min, tzinfo=timezone.utc) - timedelta(hours=14)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=timezone.utc) + timedelta(hours=12)
    return start, end

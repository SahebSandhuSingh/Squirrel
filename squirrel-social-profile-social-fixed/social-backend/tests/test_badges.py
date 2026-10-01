"""Activity badges: Early Bird, Night Owl, Park Regular (services/badges.py)."""

from __future__ import annotations

import dataclasses
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import get_settings
from app.main import create_app
from app.models import Activity, Notification, UserBadge
from app.services import badges
from tests.conftest import auth, new_sub
from tests.test_dates import IST, LIBRARY, TRACK, ZONES, Runs, _evening, _opt

SVC = {"Authorization": "Bearer svc-secret"}


def _at(day: int, hour: int, minute: int = 0) -> datetime:
    """A local (IST) time on a September 2026 day."""
    return datetime(2026, 9, day, hour, minute, tzinfo=IST)


def _publish(client, sub: str, started_at: datetime, *, ref: str | None = None, type: str = "workout") -> dict:
    r = client.post("/internal/v1/activities", headers=SVC, json={
        "user_subject": sub, "type": type, "source": "exercise", "source_ref": ref or str(uuid.uuid4()),
        "started_at": started_at.isoformat(), "duration_s": 1800,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()


def _mine(client, sub: str) -> dict[str, dict]:
    r = client.get("/v1/users/me/badges", headers=auth(sub))
    assert r.status_code == 200, r.text
    return {b["id"]: b for b in r.json()["badges"]}


def _earned(api, sub: str) -> dict[str, dict]:
    return {b["id"]: b for b in api.me(sub)["badges"]}


def _badge_notifications(client, sub: str) -> list[dict]:
    items = client.get("/v1/notifications", headers=auth(sub)).json()["items"]
    return [n for n in items if n["kind"] == "badge"]


# --------------------------------------------------------------------------- Early Bird / Night Owl


def test_early_bird_is_five_starts_before_seven_local_time(api, client):
    sub = new_sub()
    for day in (1, 2, 3, 4):
        _publish(client, sub, _at(day, 6, 59))
    _publish(client, sub, _at(5, 7, 0))  # 07:00 is not before seven
    _publish(client, sub, _at(6, 5, 30), type="meal")  # breakfast isn't an early start
    assert "early_bird" not in _earned(api, sub)
    assert _mine(client, sub)["early_bird"]["progress"] == {"current": 4, "target": 5}

    _publish(client, sub, datetime(2026, 9, 6, 22, 30, tzinfo=timezone.utc))  # 04:00 IST on the 7th
    badge = _earned(api, sub)["early_bird"]
    assert badge["kind"] == "early-bird" and badge["title"] == "Early Bird"
    [note] = _badge_notifications(client, sub)
    assert note["title"] == "New badge: Early Bird" and note["data"] == {"route": "/profile", "badge": "early_bird"}
    assert "night_owl" not in _earned(api, sub)


def test_night_owl_is_five_starts_from_nine_pm_local_time(api, client):
    sub = new_sub()
    for day in (1, 2, 3):
        _publish(client, sub, _at(day, 21, 0))
    _publish(client, sub, _at(4, 20, 59))  # a minute early
    _publish(client, sub, datetime(2026, 9, 5, 15, 30, tzinfo=timezone.utc))  # 21:00 IST
    _publish(client, sub, datetime(2026, 9, 6, 21, 30, tzinfo=timezone.utc))  # 21:30 UTC is 03:00 IST: not a night
    assert "night_owl" not in _earned(api, sub)
    assert _mine(client, sub)["night_owl"]["progress"] == {"current": 4, "target": 5}

    _publish(client, sub, _at(7, 23, 59))
    assert _earned(api, sub)["night_owl"]["kind"] == "night-owl"


def test_a_resent_activity_counts_once(api, client):
    sub = new_sub()
    for _ in range(5):  # the Exercise backend re-sends a workout after each set
        assert _publish(client, sub, _at(1, 6), ref="session-1")["created"] in (True, False)
    assert "early_bird" not in _earned(api, sub)
    assert _mine(client, sub)["early_bird"]["progress"] == {"current": 1, "target": 5}
    for day in (2, 3, 4, 5):
        _publish(client, sub, _at(day, 6))
    assert "early_bird" in _earned(api, sub)


def test_unverified_activities_do_not_count(api, client, run_module):
    sub = new_sub()
    api.me(sub)
    for i in range(3):  # flagged runs shared to the feed are kept, unverified
        run_module.add_run(sub, f"flagged-{i}", status="flagged", started_at=f"2026-09-1{i}T00:30:00Z")  # 06:00 IST
        api.post(sub, activity={"source": "run", "run_id": f"flagged-{i}"})
    for day in (1, 2, 3, 4):
        _publish(client, sub, _at(day, 6))
    assert "early_bird" not in _earned(api, sub)
    assert _mine(client, sub)["early_bird"]["progress"] == {"current": 4, "target": 5}

    # A finalized run shared before the Run Module published it counts at once.
    run_module.add_run(sub, "finalized-1", started_at="2026-09-20T00:30:00Z")
    api.post(sub, activity={"source": "run", "run_id": "finalized-1"})
    assert "early_bird" in _earned(api, sub)


def test_a_badge_is_awarded_and_notified_once(api, client, pushes, database, settings):
    sub = new_sub()
    profile_id = uuid.UUID(api.me(sub)["user"]["id"])
    token = "ExponentPushToken[early]"
    assert client.post("/v1/me/push-tokens", json={"token": token, "platform": "ios"}, headers=auth(sub)).status_code == 204
    for day in range(1, 9):
        _publish(client, sub, _at(day, 5))
    with database.SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(UserBadge).where(
            UserBadge.user_id == profile_id, UserBadge.badge_id == "early_bird")) == 1
        assert db.scalar(select(func.count()).select_from(Notification).where(
            Notification.user_id == profile_id, Notification.kind == "badge")) == 1
        activity = db.scalars(select(Activity).where(Activity.user_id == profile_id)).first()
        assert badges.after_activity(db, activity, settings) == []  # again: nothing new
    assert [p["data"].get("badge") for p in pushes.sent if p["to"] == token] == ["early_bird"]


def test_badge_rules_never_fail_the_ingest(api, client, monkeypatch):
    sub = new_sub()

    def broken(*args, **kwargs):
        raise RuntimeError("rule bug")

    monkeypatch.setattr(badges, "timed_activities", broken)
    for day in (1, 2, 3, 4, 5):
        r = client.post("/internal/v1/activities", headers=SVC, json={
            "user_subject": sub, "type": "run", "source": "run_module", "source_ref": f"run-{day}",
            "started_at": _at(day, 6).isoformat(), "distance_m": 3000,
        })
        assert r.status_code == 201, r.text
    me = api.me(sub)
    assert me["stats"]["activities"] == 5
    assert {b["id"] for b in me["badges"]} == {"first-run"}  # the rest of the transaction stands

    monkeypatch.undo()
    _publish(client, sub, _at(6, 6))
    assert "early_bird" in _earned(api, sub)


def test_thresholds_are_settings(settings, database, run_module, storage, limiter, pushes, route_points, monkeypatch):
    lenient = dataclasses.replace(settings, early_bird_hour=8, early_bird_activities=2)
    client = TestClient(create_app(lenient, database=database, run_module=run_module, storage=storage, limiter=limiter,
                                   push=pushes, route_points=route_points))
    sub = new_sub()
    _publish(client, sub, _at(1, 7, 30))
    _publish(client, sub, _at(2, 7, 45))
    assert _mine(client, sub)["early_bird"]["unlocked"] is True

    for name, value in (("SOCIAL_EARLY_BIRD_HOUR", "6"), ("SOCIAL_EARLY_BIRD_ACTIVITIES", "3"), ("SOCIAL_NIGHT_OWL_HOUR", "22"),
                        ("SOCIAL_NIGHT_OWL_ACTIVITIES", "4"), ("SOCIAL_PARK_REGULAR_DAYS", "7")):
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    try:
        s = get_settings()
        assert (s.early_bird_hour, s.early_bird_activities, s.night_owl_hour, s.night_owl_activities, s.park_regular_days) == (6, 3, 22, 4, 7)
    finally:
        get_settings.cache_clear()


# --------------------------------------------------------------------------- Park Regular


@pytest.fixture
def zoned(settings, database, run_module, storage, limiter, pushes, route_points) -> TestClient:
    app = create_app(dataclasses.replace(settings, zones=ZONES), database=database, run_module=run_module, storage=storage,
                     limiter=limiter, push=pushes, route_points=route_points)
    return TestClient(app)


def test_park_regular_is_one_zone_on_five_different_days(zoned, route_points, run_module):
    runs = Runs(zoned, route_points)
    sub = new_sub()
    zoned.get("/v1/users/me/profile", headers=auth(sub))
    _opt(zoned, sub)
    for days_ago in (1, 2, 3, 4):
        runs.run(sub, LIBRARY, _evening(days_ago))
    runs.run(sub, LIBRARY, _evening(1, hour=7))  # same day again
    for days_ago in (5, 6, 7):
        runs.run(sub, TRACK, _evening(days_ago))  # another zone
    first = "00000000-0000-4000-8000-000000000001"
    assert zoned.post("/internal/v1/activities", headers=SVC, json={  # a re-sent run counts once
        "user_subject": sub, "type": "run", "source": "run_module", "source_ref": first, "started_at": _evening(1).isoformat(),
    }).json()["created"] is False
    # A flagged run, shared first and then published by the Run Module, doesn't count either.
    flagged = "00000000-0000-4000-8000-0000000000ff"
    route_points.runs[flagged] = [(LIBRARY[0], LIBRARY[1], _evening(8)), (LIBRARY[0], LIBRARY[1], _evening(8))]
    run_module.add_run(sub, flagged, status="flagged", started_at=_evening(8).isoformat())
    assert zoned.post("/v1/posts", json={"caption": "x", "activity": {"source": "run", "run_id": flagged}}, headers=auth(sub)).status_code == 201
    assert zoned.post("/internal/v1/activities", headers=SVC, json={
        "user_subject": sub, "type": "run", "source": "run_module", "source_ref": flagged, "started_at": _evening(8).isoformat(),
    }).status_code == 200
    mine = _mine(zoned, sub)["park_regular"]
    assert mine["unlocked"] is False and mine["progress"] == {"current": 4, "target": 5}

    runs.run(sub, LIBRARY, _evening(9))
    mine = _mine(zoned, sub)["park_regular"]
    assert mine["unlocked"] is True and mine["progress"] == {"current": 5, "target": 5}
    assert [n["data"]["badge"] for n in _badge_notifications(zoned, sub)] == ["park_regular"]


def test_park_regular_is_never_awarded_without_zones(api, client, route_points):
    runs = Runs(client, route_points)
    sub = new_sub()
    api.me(sub)
    for days_ago in range(1, 7):
        runs.run(sub, LIBRARY, _evening(days_ago))
    mine = _mine(client, sub)["park_regular"]
    assert mine["unlocked"] is False and mine["progress"] is None


# --------------------------------------------------------------------------- GET /v1/users/me/badges


def test_my_badges_lists_the_whole_catalogue_in_the_apps_shape(api, client):
    sub = new_sub()
    api.me(sub)
    mine = _mine(client, sub)
    assert {"early_bird", "night_owl", "park_regular", "first-run", "founding-squirrel"} <= set(mine)
    for b in mine.values():
        assert set(b) == {"id", "name", "description", "unlocked", "unlocked_at", "progress"}
        assert b["unlocked"] is False and b["unlocked_at"] is None
    assert mine["early_bird"]["name"] == "Early Bird"
    assert mine["night_owl"]["progress"] == {"current": 0, "target": 5}
    assert mine["first-run"]["progress"] is None

    _publish(client, sub, _at(1, 21))
    for day in (2, 3, 4, 5):
        _publish(client, sub, _at(day, 22))
    owl = _mine(client, sub)["night_owl"]
    assert owl["unlocked"] is True and owl["unlocked_at"] and owl["progress"] == {"current": 5, "target": 5}
    assert client.get("/v1/users/me/badges").status_code == 401

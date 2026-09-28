from datetime import timedelta

from app.models import User
from app.services import activities
from app.services.activities import ActivityInput
from app.timeutil import local_today, week_start
from tests.conftest import auth, now_utc, post, steps, workout


def test_daily_progress(client):
    post(client, "u_a", workout(20, reps=10), steps(5200))
    d = client.get("/v1/progress/daily", headers=auth("u_a")).json()
    assert d["isToday"] and d["workouts"] == 1 and d["steps"] == 5200 and d["workoutMinutes"] == 20
    assert d["xp"] == 100  # 50 workout + 2 goals × 25
    goals = {g["id"]: g for g in d["goals"]}
    assert goals["workout"]["completed"] and goals["steps"]["completed"] and not goals["active"]["completed"]
    assert d["streak"]["current"] == 1 and d["streak"]["todayStatus"] == "done"


def test_lifetime_progress(client):
    post(client, "u_a", workout(20, reps=10, ), workout(15, reps=5))
    p = client.get("/v1/progress", headers=auth("u_a")).json()
    for k in ("totalXp", "level", "totalWorkouts", "totalWorkoutMinutes", "totalSteps", "challengesCompleted", "streak", "totalCalories", "today"):
        assert k in p
    assert p["totalWorkouts"] == 2 and p["totalWorkoutMinutes"] == 35 and p["streak"]["longest"] == 1
    assert p["level"]["level"] == 1 and p["level"]["xpForNextLevel"] == 2000


def _backfill(db, user_id, days_ago, minutes):
    """Record through the real engine as if it were `days_ago` days ago (the API only accepts the sync window)."""
    user = db.get(User, user_id)
    at = now_utc() - timedelta(days=days_ago)
    activities.record(db, user, ActivityInput(f"bf-{days_ago}", "WORKOUT_COMPLETED", minutes, at, {"reps": 5}), source="client", now=at + timedelta(minutes=1))
    db.commit()


def test_weekly_with_previous_week_comparison(client, db):
    client.get("/v1/me", headers=auth("u_a"))
    today = local_today("Asia/Kolkata")
    this_monday = week_start(today)
    days_into_week = (today - this_monday).days
    _backfill(db, "u_a", days_into_week + 3, 20)   # last week
    post(client, "u_a", workout(20, reps=5), workout(10, reps=5))  # this week
    w = client.get("/v1/progress/weekly", headers=auth("u_a")).json()
    assert w["weekStart"] == this_monday.isoformat() and len(w["days"]) == 7
    assert w["workouts"] == 2 and w["previous"]["workouts"] == 1
    assert w["change"]["workouts"] == 1.0  # +100 %
    assert w["activeDays"] == 1
    prev = client.get("/v1/progress/weekly", headers=auth("u_a"), params={"weekStart": (this_monday - timedelta(days=7)).isoformat()}).json()
    assert prev["workouts"] == 1


def test_streak_counts_consecutive_days(client, db):
    client.get("/v1/me", headers=auth("u_a"))
    for d in (2, 1):
        _backfill(db, "u_a", d, 20)
    post(client, "u_a", workout(20, reps=5))
    s = client.get("/v1/progress", headers=auth("u_a")).json()["streak"]
    assert s["current"] == 3 and s["longest"] == 3
    hist = client.get("/v1/xp/history", headers=auth("u_a")).json()["items"]
    assert [t["amount"] for t in hist if t["source"] == "STREAK"] == [20]  # 3-day milestone, once


def test_history_zero_filled(client):
    post(client, "u_a", workout(20, reps=5))
    h = client.get("/v1/progress/history", headers=auth("u_a"), params={"days": 14}).json()
    assert len(h["days"]) == 14 and h["days"][-1]["workouts"] == 1 and sum(d["workouts"] for d in h["days"]) == 1
    assert client.get("/v1/progress/history", headers=auth("u_a"), params={"days": 1000}).status_code == 422


def test_timezone_decides_the_day(client):
    client.patch("/v1/me", headers=auth("u_a"), json={"timezone": "Pacific/Kiritimati"})  # UTC+14
    client.patch("/v1/me", headers=auth("u_b"), json={"timezone": "Pacific/Pago_Pago"})   # UTC−11
    ev = workout(20)
    post(client, "u_a", ev)
    post(client, "u_b", {**ev, "idempotencyKey": "other"})
    da = client.get("/v1/progress/daily", headers=auth("u_a")).json()["date"]
    db_ = client.get("/v1/progress/daily", headers=auth("u_b")).json()["date"]
    assert da != db_
    assert client.patch("/v1/me", headers=auth("u_a"), json={"timezone": "Mars/Base"}).status_code == 422

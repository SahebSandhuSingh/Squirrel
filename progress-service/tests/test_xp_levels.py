from datetime import timedelta

from app.levels import calculate_level, get_xp_for_next_level, level_bounds, level_info
from tests.conftest import auth, iso, key, now_utc, post, steps, workout


def test_workout_awards_xp_and_goal(client):
    body = post(client, "u_a", workout(20, reps=10))
    r = body["results"][0]
    assert r["status"] == "accepted"
    assert r["xpAwarded"] == 75  # 30 base + 2×10 reps, plus the "complete a workout" goal (25)
    assert r["goalsCompleted"] == ["workout"]
    xp = client.get("/v1/xp", headers=auth("u_a")).json()
    assert xp["totalXp"] == 75 and xp["today"] == 75
    assert xp["bySource"] == {"WORKOUT": 50, "DAILY_GOAL": 25}
    hist = client.get("/v1/xp/history", headers=auth("u_a")).json()["items"]
    assert sorted(t["source"] for t in hist) == ["DAILY_GOAL", "WORKOUT"]
    assert all(t["amount"] > 0 and t["sourceId"] for t in hist)


def test_duplicate_submission_awards_once(client):
    ev = workout(20, reps=10, k="session-123")
    first = post(client, "u_a", ev)["results"][0]
    again = post(client, "u_a", ev, ev)["results"]
    assert first["status"] == "accepted"
    assert [r["status"] for r in again] == ["duplicate", "duplicate"]
    assert all(r["eventId"] == first["eventId"] for r in again)
    assert client.get("/v1/xp", headers=auth("u_a")).json()["totalXp"] == 75
    assert len(client.get("/v1/activities", headers=auth("u_a"), params={"type": "WORKOUT_COMPLETED"}).json()["items"]) == 1


def test_same_key_different_users_are_independent(client):
    post(client, "u_a", workout(k="shared"))
    assert post(client, "u_b", workout(k="shared"))["results"][0]["status"] == "accepted"


def test_invalid_activity_rejected_without_xp(client):
    now = now_utc()
    bad = [
        {"idempotencyKey": key(), "type": "RUN_COMPLETED", "value": 5, "occurredAt": iso(now), "metadata": {"minutes": 30}},  # trusted-only type
        {"idempotencyKey": key(), "type": "XP_GRANT", "value": 9999, "occurredAt": iso(now)},
        workout(-5),
        workout(301),
        workout(20, reps=100000),
        workout(20, at=now + timedelta(hours=1)),  # future
        workout(20, at=now - timedelta(days=30)),  # outside the offline-sync window
        steps(1_000_000),
        steps(-10),
        {"idempotencyKey": key(), "type": "WORKOUT_COMPLETED", "value": 20, "occurredAt": now.replace(tzinfo=None).isoformat()},  # no offset
    ]
    results = post(client, "u_a", *bad)["results"]
    assert [r["status"] for r in results] == ["rejected"] * len(bad), results
    assert results[0]["code"] == "type_not_allowed"
    assert results[5]["code"] == "future_timestamp"
    assert results[6]["code"] == "too_old"
    assert results[9]["code"] == "timestamp_needs_timezone"
    assert client.get("/v1/xp", headers=auth("u_a")).json()["totalXp"] == 0


def test_client_cannot_send_xp_or_user_fields(client):
    ev = workout()
    for extra in ({"xp": 5000}, {"userId": "u_b"}, {"completed": True}):
        r = client.post("/v1/activities", headers=auth("u_a"), json={"events": [{**ev, **extra}]})
        assert r.status_code == 422, extra
    r = client.post("/v1/activities", headers=auth("u_a"), json={"events": [ev], "userId": "u_b"})
    assert r.status_code == 422
    assert client.post("/v1/xp", headers=auth("u_a"), json={"amount": 1000}).status_code == 405


def test_workout_xp_daily_cap(client):
    events = [workout(10, reps=50) for _ in range(8)]  # 100 XP each before the cap
    post(client, "u_a", *events)
    by_source = client.get("/v1/xp", headers=auth("u_a")).json()["bySource"]
    assert by_source["WORKOUT"] == 300


def test_daily_workout_minutes_limit(client):
    results = post(client, "u_a", workout(300), workout(300), workout(5))["results"]
    assert [r["status"] for r in results] == ["accepted", "accepted", "rejected"]
    assert results[2]["code"] == "daily_limit"


def test_steps_are_cumulative_and_resends_do_not_inflate(client):
    post(client, "u_a", steps(3000))
    post(client, "u_a", steps(3000))
    post(client, "u_a", steps(2500))  # a lower reading (e.g. re-sync) credits nothing
    body = post(client, "u_a", steps(6000))
    assert body["progress"]["steps"] == 6000
    items = client.get("/v1/activities", headers=auth("u_a"), params={"type": "STEP_COUNT"}).json()["items"]
    assert sorted(i["credited"] for i in items) == [0, 0, 3000, 3000]
    assert body["xp"]["bySource"] == {"DAILY_GOAL": 25}  # the 5,000-step goal, once


def test_level_calculation():
    assert calculate_level(0) == 1
    assert calculate_level(1999) == 1
    assert calculate_level(2000) == 2
    assert get_xp_for_next_level(2500) == 4000
    assert level_info(3000) == {"level": 2, "currentXP": 3000, "xpForCurrentLevel": 2000, "xpForNextLevel": 4000, "progress": 0.5}
    assert level_bounds(1200, "thresholds:0,500,1500") == (2, 500, 1500)
    assert level_bounds(3600, "thresholds:0,500,1500") == (5, 3500, 4500)  # final gap repeats


def test_level_endpoint(client):
    assert client.get("/v1/levels/4100").json()["level"] == 3
    assert client.get("/v1/levels/-1").status_code == 422


def test_level_updates_with_xp(client, db):
    from app.services.xp import award
    from app.timeutil import local_today

    client.get("/v1/me", headers=auth("u_a"))
    award(db, "u_a", 1990, "CHALLENGE", "test-grant", local_today("Asia/Kolkata"))
    db.commit()
    assert client.get("/v1/xp", headers=auth("u_a")).json()["level"]["level"] == 1
    post(client, "u_a", workout(20, reps=10))
    lvl = client.get("/v1/progress", headers=auth("u_a")).json()["level"]
    assert lvl["level"] == 2 and lvl["currentXP"] == 2065

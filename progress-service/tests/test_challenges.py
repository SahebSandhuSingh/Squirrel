from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.services import challenges as ch
from app.timeutil import local_today
from tests.conftest import SERVICE, auth, iso, now_utc, post, run, workout

TZ = "Asia/Kolkata"


def today() -> str:
    return datetime.now(ZoneInfo(TZ)).date().isoformat()


def daily_id(code: str) -> str:
    return f"{code}:{today()}"


def make_challenge(client, **over) -> str:
    now = now_utc()
    body = {"kind": "special", "title": "Test", "metric": "workouts", "target": 2, "xpReward": 120,
            "startsAt": iso(now - timedelta(hours=1)), "endsAt": iso(now + timedelta(days=2)), **over}
    r = client.post("/internal/v1/challenges", headers=SERVICE, json=body)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_daily_challenges_listed(client):
    body = client.get("/v1/challenges", headers=auth("u_a"), params={"kind": "daily"}).json()
    ids = {c["id"] for c in body["challenges"]}
    assert {daily_id("daily-move-30"), daily_id("daily-steps-10k"), daily_id("daily-run-5k")} <= ids
    c = body["challenges"][0]
    for k in ("id", "kind", "title", "metric", "unit", "target", "xpReward", "startsAt", "endsAt", "status", "joined", "canJoin", "me"):
        assert k in c
    assert c["me"] == {"current": 0, "target": c["target"], "progress": 0.0, "completed": False, "status": None}


def test_join_and_duplicate_join(client):
    client.get("/v1/challenges", headers=auth("u_a"))
    cid = daily_id("daily-move-30")
    r = client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    assert r.status_code == 200 and r.json()["joined"] is True and r.json()["canJoin"] is False
    again = client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    assert again.status_code == 409 and again.json()["code"] == "already_joined"
    assert client.post("/v1/challenges/nope/join", headers=auth("u_a")).status_code == 404


def test_expired_challenges_cannot_be_joined(client, db):
    yesterday = local_today(TZ) - timedelta(days=1)
    ch.ensure_daily(db, yesterday)
    db.commit()
    r = client.post(f"/v1/challenges/daily-move-30:{yesterday.isoformat()}/join", headers=auth("u_a"))
    assert r.status_code == 409 and r.json()["code"] == "challenge_expired"
    now = now_utc()
    cid = make_challenge(client, startsAt=iso(now - timedelta(days=2)), endsAt=iso(now - timedelta(minutes=1)))
    r = client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    assert r.status_code == 409 and r.json()["code"] == "challenge_expired"


def test_completion_is_computed_and_awarded_once(client):
    client.get("/v1/challenges", headers=auth("u_a"))
    cid = daily_id("daily-move-30")
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    r1 = post(client, "u_a", workout(20, reps=10))["results"][0]
    assert r1["challengesCompleted"] == []
    prog = client.get(f"/v1/challenges/{cid}/progress", headers=auth("u_a")).json()
    assert prog["current"] == 20 and prog["target"] == 30 and prog["completed"] is False and abs(prog["progress"] - 20 / 30) < 1e-3
    r2 = post(client, "u_a", workout(15, reps=10))["results"][0]
    assert r2["challengesCompleted"] == [cid]
    for _ in range(4):  # more activity, re-joins: no second award
        post(client, "u_a", workout(10, reps=5))
        again = client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
        assert again.status_code == 409
    prog = client.get(f"/v1/challenges/{cid}/progress", headers=auth("u_a")).json()
    assert prog["completed"] is True and prog["progress"] == 1.0
    hist = client.get("/v1/xp/history", headers=auth("u_a"), params={"limit": 200}).json()["items"]
    assert [t for t in hist if t["source"] == "CHALLENGE"] == [next(t for t in hist if t["source"] == "CHALLENGE")]
    assert next(t for t in hist if t["source"] == "CHALLENGE")["amount"] == 40
    assert client.get("/v1/progress", headers=auth("u_a")).json()["challengesCompleted"] == 1


def test_activity_before_join_counts_inside_window(client):
    client.get("/v1/challenges", headers=auth("u_a"))
    post(client, "u_a", workout(35, reps=10))
    cid = daily_id("daily-move-30")
    view = client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a")).json()
    assert view["me"]["completed"] is True


def test_leave_and_rejoin(client):
    cid = make_challenge(client)
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    left = client.post(f"/v1/challenges/{cid}/leave", headers=auth("u_a"))
    assert left.status_code == 200 and left.json()["joined"] is False
    assert client.post(f"/v1/challenges/{cid}/leave", headers=auth("u_a")).json()["code"] == "not_participating"
    assert client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a")).status_code == 200


def test_special_rules_min_level_and_capacity(client):
    gated = make_challenge(client, rules={"minLevel": 5})
    r = client.post(f"/v1/challenges/{gated}/join", headers=auth("u_a"))
    assert r.status_code == 403 and r.json()["code"] == "not_eligible"
    campus = make_challenge(client, rules={"campus": "Ganeshkhind Campus"})
    assert client.post(f"/v1/challenges/{campus}/join", headers=auth("u_a")).status_code == 403
    client.patch("/v1/me", headers=auth("u_a"), json={"campus": "Ganeshkhind Campus"})
    assert client.post(f"/v1/challenges/{campus}/join", headers=auth("u_a")).status_code == 200
    small = make_challenge(client, maxParticipants=1)
    assert client.post(f"/v1/challenges/{small}/join", headers=auth("u_a")).status_code == 200
    r = client.post(f"/v1/challenges/{small}/join", headers=auth("u_b"))
    assert r.status_code == 409 and r.json()["code"] == "challenge_full"


def test_special_custom_xp(client):
    cid = make_challenge(client, target=2, xpReward=333)
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    post(client, "u_a", workout(10, reps=1))
    done = post(client, "u_a", workout(10, reps=1))["results"][0]
    assert done["challengesCompleted"] == [cid]
    hist = client.get("/v1/xp/history", headers=auth("u_a")).json()["items"]
    assert [t["amount"] for t in hist if t["source"] == "CHALLENGE"] == [333]


def test_unfinished_individual_challenge_fails_on_resolve(client, db):
    cid = make_challenge(client, target=5)
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    post(client, "u_a", workout(10, reps=1))
    ch.resolve_due(db, now=now_utc() + timedelta(days=3))
    db.commit()
    view = client.get(f"/v1/challenges/{cid}", headers=auth("u_a")).json()
    assert view["status"] == "ended" and view["me"]["status"] == "failed" and view["me"]["current"] == 1


def test_group_contributions_and_completion(client):
    cid = make_challenge(client, kind="group", metric="workouts", target=3, xpReward=100, groupName="Crew")
    for u in ("u_a", "u_b", "u_c", "u_d"):
        assert client.post(f"/v1/challenges/{cid}/join", headers=auth(u)).status_code == 200
    post(client, "u_a", workout(10, reps=1))
    post(client, "u_a", workout(10, reps=1))
    mid = client.get(f"/v1/challenges/{cid}/progress", headers=auth("u_b")).json()
    assert mid["collective"] == 2 and mid["completed"] is False
    res = post(client, "u_b", workout(10, reps=1))["results"][0]
    assert res["challengesCompleted"] == [cid]
    view = client.get(f"/v1/challenges/{cid}", headers=auth("u_c")).json()
    assert view["group"]["collective"] == 3 and view["group"]["completedAt"] and view["canJoin"] is False
    board = client.get("/v1/leaderboards/group", headers=auth("u_a"), params={"challengeId": cid}).json()
    assert [(u["userId"], u["score"], u["rank"]) for u in board["users"]][:2] == [("u_a", 2, 1), ("u_b", 1, 2)]
    for u, expected in (("u_a", [100]), ("u_b", [100]), ("u_c", []), ("u_d", [])):  # only contributors are rewarded
        hist = client.get("/v1/xp/history", headers=auth(u)).json()["items"]
        assert [t["amount"] for t in hist if t["source"] == "GROUP_CHALLENGE"] == expected
    post(client, "u_a", workout(10, reps=1))  # further activity never re-awards
    hist = client.get("/v1/xp/history", headers=auth("u_a")).json()["items"]
    assert [t["amount"] for t in hist if t["source"] == "GROUP_CHALLENGE"] == [100]
    r = client.post(f"/v1/challenges/{cid}/join", headers=auth("u_e"))
    assert r.status_code == 409 and r.json()["code"] == "already_completed"


def test_group_distance_from_verified_runs(client):
    cid = make_challenge(client, kind="group", metric="distance_km", target=10, xpReward=50)
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_b"))
    run(4.5, "u_a", client)
    out = run(6.0, "u_b", client)
    assert out["results"][0]["challengesCompleted"] == [cid]


def test_can_join_reflects_rules(client):
    gated = make_challenge(client, rules={"minLevel": 5})
    full = make_challenge(client, maxParticipants=1)
    client.post(f"/v1/challenges/{full}/join", headers=auth("u_b"))
    views = {c["id"]: c for c in client.get("/v1/challenges", headers=auth("u_a"), params={"kind": "special"}).json()["challenges"]}
    assert views[gated]["canJoin"] is False and views[gated]["ineligible"]["code"] == "not_eligible"
    assert views[full]["canJoin"] is False and views[full]["ineligible"]["code"] == "challenge_full"


def test_rejoin_respects_capacity(client):
    cid = make_challenge(client, maxParticipants=1)
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    client.post(f"/v1/challenges/{cid}/leave", headers=auth("u_a"))
    assert client.post(f"/v1/challenges/{cid}/join", headers=auth("u_b")).status_code == 200
    r = client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a"))
    assert r.status_code == 409 and r.json()["code"] == "challenge_full"

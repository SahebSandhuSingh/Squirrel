import time

import jwt

from tests.conftest import SERVICE, auth, post, token, workout


def test_auth_required(client):
    for path in ("/v1/progress", "/v1/xp", "/v1/challenges", "/v1/leaderboards/global"):
        assert client.get(path).status_code == 401
    assert client.get("/v1/progress", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    assert client.get("/v1/progress", headers={"Authorization": f"Bearer {token('u_a', secret='wrong')}"}).status_code == 401
    assert client.get("/v1/progress", headers={"Authorization": f"Bearer {token('u_a', exp_in=-60)}"}).status_code == 401
    unsigned = jwt.encode({"sub": "u_a", "exp": int(time.time()) + 60}, None, algorithm="none")
    assert client.get("/v1/progress", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401
    no_sub = jwt.encode({"exp": int(time.time()) + 60}, "test-secret-that-is-at-least-32-bytes", algorithm="HS256")
    assert client.get("/v1/progress", headers={"Authorization": f"Bearer {no_sub}"}).status_code == 401


def test_internal_requires_service_key(client):
    body = {"userId": "u_a", "events": [workout()]}
    assert client.post("/internal/v1/activities", json=body).status_code == 403
    assert client.post("/internal/v1/activities", headers={"X-Service-Key": "guess"}, json=body).status_code == 403
    assert client.post("/internal/v1/activities", headers=auth("u_a"), json=body).status_code == 403
    assert client.post("/internal/v1/jobs/resolve").status_code == 403
    assert client.post("/internal/v1/challenges", json={}).status_code == 403
    assert client.post("/internal/v1/activities", headers=SERVICE, json=body).status_code == 200


def test_identity_comes_from_token_only(client):
    post(client, "u_a", workout(20, reps=10))
    assert client.get("/v1/xp", headers=auth("u_b")).json()["totalXp"] == 0
    assert client.get("/v1/progress", headers=auth("u_b"), params={"userId": "u_a"}).json()["userId"] == "u_b"


def test_cannot_touch_someone_elses_challenge(client):
    now_ok = client.post("/internal/v1/challenges", headers=SERVICE, json={
        "kind": "special", "title": "T", "metric": "workouts", "target": 2, "xpReward": 10,
        "startsAt": "2020-01-01T00:00:00Z", "endsAt": "2099-01-01T00:00:00Z"}).json()["id"]
    client.post(f"/v1/challenges/{now_ok}/join", headers=auth("u_a"))
    assert client.get(f"/v1/challenges/{now_ok}/progress", headers=auth("u_b")).status_code == 404
    assert client.post(f"/v1/challenges/{now_ok}/leave", headers=auth("u_b")).status_code == 409
    assert client.get(f"/v1/challenges/{now_ok}", headers=auth("u_a")).json()["joined"] is True
    for method, path in (("post", f"/v1/challenges/{now_ok}/complete"), ("patch", f"/v1/challenges/{now_ok}"), ("post", "/v1/leaderboards/global")):
        assert getattr(client, method)(path, headers=auth("u_a"), json={"status": "completed"}).status_code in (404, 405)


def test_global_leaderboard_is_deterministic(client):
    post(client, "u_c", workout(20, reps=10))                    # 75
    post(client, "u_a", workout(20, reps=10))                    # 75 (tie with u_c)
    post(client, "u_b", workout(40, reps=35))                    # 100 + 2 goals = 150
    board = client.get("/v1/leaderboards/global", headers=auth("u_a"), params={"period": "weekly"}).json()
    assert [(u["rank"], u["userId"], u["xp"]) for u in board["users"]] == [(1, "u_b", 150), (2, "u_a", 75), (2, "u_c", 75)]
    assert board["rank"] == 2 and board["me"] == {"rank": 2, "xp": 75} and board["total"] == 3
    page = client.get("/v1/leaderboards/global", headers=auth("u_a"), params={"period": "alltime", "limit": 1}).json()
    assert len(page["users"]) == 1 and page["nextCursor"] == 1
    assert client.get("/v1/leaderboards/global", headers=auth("u_a"), params={"period": "yearly"}).status_code == 422
    assert client.get("/v1/leaderboards/city", headers=auth("u_a")).status_code == 404


def test_friends_and_campus_boards(client):
    for u in ("u_a", "u_b", "u_c"):
        post(client, u, workout(20, reps=10))
    assert client.put("/v1/me/following/u_b", headers=auth("u_a")).status_code == 204
    assert client.put("/v1/me/following/u_a", headers=auth("u_a")).status_code == 422
    friends = client.get("/v1/leaderboards/friends", headers=auth("u_a")).json()
    assert {u["userId"] for u in friends["users"]} == {"u_a", "u_b"}
    assert client.get("/v1/leaderboards/campus", headers=auth("u_a")).status_code == 409
    for u in ("u_a", "u_c"):
        client.patch("/v1/me", headers=auth(u), json={"campus": "Ganeshkhind Campus"})
    campus = client.get("/v1/leaderboards/campus", headers=auth("u_a")).json()
    assert {u["userId"] for u in campus["users"]} == {"u_a", "u_c"}

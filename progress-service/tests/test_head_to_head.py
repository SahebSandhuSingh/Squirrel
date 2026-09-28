from datetime import timedelta

from app.services import challenges as ch
from tests.conftest import auth, now_utc, post
from tests.conftest import steps as _steps


def steps(total):  # a duel's window opens when it is created, so log "now", not a minute ago
    return _steps(total, at=now_utc())


def duel(client, a="u_a", b="u_b", metric="steps", hours=24) -> str:
    client.get("/v1/me", headers=auth(b))  # opponent must exist
    r = client.post("/v1/challenges/head-to-head", headers=auth(a), json={"opponentId": b, "metric": metric, "durationHours": hours})
    assert r.status_code == 201, r.text
    view = r.json()
    assert view["opponent"]["userId"] == b and view["opponent"]["status"] == "invited"
    return view["id"]


def resolve(db, hours=24):
    ch.resolve_due(db, now=now_utc() + timedelta(hours=hours, minutes=5) + timedelta(hours=3))
    db.commit()


def test_scores_and_server_side_winner(client, db):
    cid = duel(client)
    invite = client.get(f"/v1/challenges/{cid}", headers=auth("u_b")).json()
    assert invite["invited"] is True and invite["canJoin"] is True
    assert client.post(f"/v1/challenges/{cid}/join", headers=auth("u_b")).status_code == 200
    post(client, "u_a", steps(4000))
    post(client, "u_b", steps(6500))
    view = client.get(f"/v1/challenges/{cid}", headers=auth("u_a")).json()
    assert view["me"]["current"] == 4000 and view["opponent"]["score"] == 6500 and view["winnerUserId"] is None
    resolve(db)
    a = client.get(f"/v1/challenges/{cid}", headers=auth("u_a")).json()
    b = client.get(f"/v1/challenges/{cid}", headers=auth("u_b")).json()
    assert a["winnerUserId"] == "u_b" and a["me"]["status"] == "lost" and b["me"]["status"] == "won" and b["me"]["completed"] is True
    resolve(db, hours=48)  # idempotent
    hist_b = client.get("/v1/xp/history", headers=auth("u_b")).json()["items"]
    hist_a = client.get("/v1/xp/history", headers=auth("u_a")).json()["items"]
    assert [t["amount"] for t in hist_b if t["source"] == "H2H_WIN"] == [150]
    assert not [t for t in hist_a if t["source"].startswith("H2H")]
    ended = client.get("/v1/challenges", headers=auth("u_a"), params={"status": "ended"}).json()["challenges"]
    assert [c["id"] for c in ended] == [cid]


def test_tie(client, db):
    cid = duel(client)
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_b"))
    post(client, "u_a", steps(3000))
    post(client, "u_b", steps(3000))
    resolve(db)
    for u in ("u_a", "u_b"):
        view = client.get(f"/v1/challenges/{cid}", headers=auth(u)).json()
        assert view["me"]["status"] == "tied" and view["winnerUserId"] is None
        hist = client.get("/v1/xp/history", headers=auth(u)).json()["items"]
        assert [t["amount"] for t in hist if t["source"] == "H2H_TIE"] == [50]


def test_unaccepted_duel_is_cancelled_without_xp(client, db):
    cid = duel(client)
    post(client, "u_a", steps(9000))
    resolve(db)
    view = client.get(f"/v1/challenges/{cid}", headers=auth("u_a")).json()
    assert view["status"] == "cancelled" and view["winnerUserId"] is None


def test_forfeit_by_leaving(client, db):
    cid = duel(client)
    client.post(f"/v1/challenges/{cid}/join", headers=auth("u_b"))
    post(client, "u_b", steps(8000))
    client.post(f"/v1/challenges/{cid}/leave", headers=auth("u_b"))
    resolve(db)
    assert client.get(f"/v1/challenges/{cid}", headers=auth("u_a")).json()["winnerUserId"] == "u_a"


def test_outsiders_cannot_see_or_join(client):
    cid = duel(client)
    assert client.get(f"/v1/challenges/{cid}", headers=auth("u_c")).status_code == 404
    r = client.post(f"/v1/challenges/{cid}/join", headers=auth("u_c"))
    assert r.status_code == 403 and r.json()["code"] == "not_eligible"
    assert client.post(f"/v1/challenges/{cid}/join", headers=auth("u_a")).json()["code"] == "already_joined"


def test_create_validation(client):
    client.get("/v1/me", headers=auth("u_b"))
    bad = [
        ({"opponentId": "u_a", "metric": "steps", "durationHours": 24}, 422),
        ({"opponentId": "ghost", "metric": "steps", "durationHours": 24}, 404),
        ({"opponentId": "u_b", "metric": "xp", "durationHours": 24}, 422),
        ({"opponentId": "u_b", "metric": "steps", "durationHours": 500}, 422),
        ({"opponentId": "u_b", "metric": "steps", "durationHours": 24, "winner": "u_a"}, 422),
    ]
    for body, code in bad:
        assert client.post("/v1/challenges/head-to-head", headers=auth("u_a"), json=body).status_code == code, body

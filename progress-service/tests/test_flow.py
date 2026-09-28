"""USER → ACTIVITY → PROGRESS → CHALLENGE PROGRESS → COMPLETION → XP → LEVEL → LEADERBOARD."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.xp import award
from app.timeutil import local_today
from tests.conftest import auth, post, workout


def test_complete_flow(client, db):
    me = client.get("/v1/me", headers=auth("u_flow")).json()                       # USER (created from the token)
    assert me["userId"] == "u_flow"
    award(db, "u_flow", 1950, "CHALLENGE", "earlier-season", local_today("Asia/Kolkata"))  # already close to level 2
    db.commit()
    post(client, "u_rival", workout(20, reps=10))

    cid = f"daily-move-30:{datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat()}"
    assert client.get("/v1/challenges", headers=auth("u_flow")).status_code == 200
    assert client.post(f"/v1/challenges/{cid}/join", headers=auth("u_flow")).status_code == 200

    r = post(client, "u_flow", workout(15, reps=10))                               # ACTIVITY
    assert client.get("/v1/progress/daily", headers=auth("u_flow")).json()["workoutMinutes"] == 15  # PROGRESS
    assert client.get(f"/v1/challenges/{cid}/progress", headers=auth("u_flow")).json()["current"] == 15  # CHALLENGE PROGRESS

    r = post(client, "u_flow", workout(15, reps=10))["results"][0]
    assert r["challengesCompleted"] == [cid]                                        # COMPLETION
    xp = client.get("/v1/xp", headers=auth("u_flow")).json()
    assert xp["bySource"]["CHALLENGE"] == 1950 + 40                                 # XP (40 from the daily)
    assert xp["totalXp"] == 1950 + 50 + 50 + 25 + 25 + 40
    assert xp["level"]["level"] == 2                                                # LEVEL
    board = client.get("/v1/leaderboards/global", headers=auth("u_flow"), params={"period": "alltime"}).json()
    assert board["users"][0]["userId"] == "u_flow" and board["rank"] == 1           # LEADERBOARD

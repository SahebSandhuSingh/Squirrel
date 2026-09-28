"""Races that unique constraints + the per-user row lock must win. Postgres only (SQLite serialises writers)."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from app.db import engine
from tests.conftest import auth, workout

pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="needs real concurrent transactions")


def test_parallel_duplicates_award_once(client):
    client.get("/v1/me", headers=auth("u_a"))
    ev = workout(20, reps=10, k="same-session")

    def send(_):
        return client.post("/v1/activities", headers=auth("u_a"), json={"events": [ev]}).json()["results"][0]["status"]

    with ThreadPoolExecutor(8) as pool:
        statuses = list(pool.map(send, range(16)))
    assert statuses.count("accepted") == 1 and statuses.count("duplicate") == 15
    assert client.get("/v1/xp", headers=auth("u_a")).json()["totalXp"] == 75


def test_parallel_distinct_workouts_respect_daily_cap(client):
    client.get("/v1/me", headers=auth("u_a"))

    def send(_):
        return client.post("/v1/activities", headers=auth("u_a"), json={"events": [workout(10, reps=50)]}).status_code

    with ThreadPoolExecutor(8) as pool:
        assert set(pool.map(send, range(10))) == {200}
    xp = client.get("/v1/xp", headers=auth("u_a")).json()
    assert xp["bySource"]["WORKOUT"] == 300
    assert client.get("/v1/progress", headers=auth("u_a")).json()["totalWorkouts"] == 10

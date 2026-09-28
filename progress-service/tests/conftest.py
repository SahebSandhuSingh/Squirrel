"""Test harness. Uses TEST_DATABASE_URL (Postgres recommended) or a throwaway SQLite file.

Settings are read at import, so the environment is set before anything from `app` is imported.
"""

from __future__ import annotations

import os
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone

_tmp = tempfile.mkdtemp(prefix="progress-tests-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/test.db"
os.environ["APP_ENV"] = "test"
os.environ["JWT_DEV_SECRET"] = "test-secret-that-is-at-least-32-bytes"
os.environ["SERVICE_API_KEY"] = "test-service-key"
os.environ["DEFAULT_TIMEZONE"] = "Asia/Kolkata"

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import ActivityEvent, Challenge, ChallengeParticipant, DailyProgress, Follow, User, UserStats, XpTransaction  # noqa: E402

TABLES = (ChallengeParticipant, Challenge, XpTransaction, ActivityEvent, DailyProgress, Follow, UserStats, User)
SERVICE = {"X-Service-Key": "test-service-key"}


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean():
    with SessionLocal() as s:
        for t in TABLES:
            s.execute(delete(t))
        s.commit()
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


def token(sub: str, name: str | None = None, secret: str = "test-secret-that-is-at-least-32-bytes", exp_in: int = 3600) -> str:
    claims = {"sub": sub, "exp": int(time.time()) + exp_in}
    if name:
        claims["name"] = name
    return jwt.encode(claims, secret, algorithm="HS256")


def auth(sub: str) -> dict:
    return {"Authorization": f"Bearer {token(sub)}"}


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def key() -> str:
    return str(uuid.uuid4())


def workout(minutes: float = 20, reps: int = 10, at: datetime | None = None, k: str | None = None) -> dict:
    return {"idempotencyKey": k or key(), "type": "WORKOUT_COMPLETED", "value": minutes, "occurredAt": iso(at or now_utc() - timedelta(minutes=1)),
            "metadata": {"exercise": "squat", "reps": reps}}


def steps(total: int, at: datetime | None = None, k: str | None = None) -> dict:
    return {"idempotencyKey": k or key(), "type": "STEP_COUNT", "value": total, "occurredAt": iso(at or now_utc() - timedelta(minutes=1))}


def run(km: float, user: str, client: TestClient, minutes: float = 30, at: datetime | None = None, k: str | None = None) -> dict:
    ev = {"idempotencyKey": k or key(), "type": "RUN_COMPLETED", "value": km, "occurredAt": iso(at or now_utc() - timedelta(minutes=1)), "metadata": {"minutes": minutes}}
    r = client.post("/internal/v1/activities", headers=SERVICE, json={"userId": user, "source": "run_module", "events": [ev]})
    assert r.status_code == 200, r.text
    return r.json()


def post(client: TestClient, user: str, *events: dict) -> dict:
    r = client.post("/v1/activities", headers=auth(user), json={"events": list(events)})
    assert r.status_code == 200, r.text
    return r.json()

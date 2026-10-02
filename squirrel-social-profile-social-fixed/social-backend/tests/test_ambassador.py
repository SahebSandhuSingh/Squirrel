import uuid
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.db import utcnow
from app.models import AmbassadorApplication, User
from tests.conftest import auth, new_sub

# We need the verified helper from test_community.py (or we can just write it here)
from tests.conftest import make_token
def verified(sub: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub, ev=True)}"}

def test_unverified_member(client, settings):
    # an unverified member gets open:false, closed_reason "verify_email"
    sub = new_sub()
    client.get("/v1/users/me/profile", headers=auth(sub))  # create user
    r = client.get("/v1/ambassador/application", headers=auth(sub))
    assert r.status_code == 200
    data = r.json()
    assert data["open"] is False
    assert data["closed_reason"] == "verify_email"

def test_ambassador_open_off(client, settings):
    # with SOCIAL_AMBASSADOR_OPEN off: open:false
    object.__setattr__(settings, "ambassador_open", False)
    sub = new_sub()
    r = client.get("/v1/ambassador/application", headers=verified(sub))
    assert r.status_code == 200
    data = r.json()
    assert data["open"] is False

def test_valid_submit_creates_application(client, settings):
    # a valid submit creates one application, status pending
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    key = "key1"
    answers = {"why": "reason", "ideas": "some ideas", "role": "Student"}
    
    r = client.post("/v1/ambassador/application", json={"answers": answers, "idempotency_key": key}, headers=verified(sub))
    assert r.status_code == 200
    app = r.json()
    assert app["status"] == "pending"
    assert app["id"] is not None

def test_idempotency_key(client, settings):
    # the same idempotency_key returns the same application, not a second one
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    key = "key1"
    answers = {"why": "reason", "ideas": "some ideas", "role": "Student"}
    
    r1 = client.post("/v1/ambassador/application", json={"answers": answers, "idempotency_key": key}, headers=verified(sub))
    r2 = client.post("/v1/ambassador/application", json={"answers": answers, "idempotency_key": key}, headers=verified(sub))
    
    assert r1.json()["id"] == r2.json()["id"]

def test_rate_limit_not_exhausted_by_replays(client, settings):
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    answers = {"why": "reason", "ideas": "some ideas", "role": "Student"}
    
    # Send 4 requests with same idempotency key (limit is 3)
    for _ in range(4):
        r = client.post("/v1/ambassador/application", json={"answers": answers, "idempotency_key": "key1"}, headers=verified(sub))
        assert r.status_code == 200

    # Sending a new idempotency key after 1 new creation (limit 3, used 1)
    # The rate limiter still has 2 left, so this should succeed.
    r2 = client.post("/v1/ambassador/application", json={"answers": answers, "idempotency_key": "key2"}, headers=verified(sub))
    assert r2.status_code == 200

def test_second_submit_while_pending(client, settings):
    # a second submit while one is pending returns the existing one
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    answers = {"why": "reason", "ideas": "some ideas", "role": "Student"}
    
    r1 = client.post("/v1/ambassador/application", json={"answers": answers, "idempotency_key": "key1"}, headers=verified(sub))
    r2 = client.post("/v1/ambassador/application", json={"answers": answers, "idempotency_key": "key2"}, headers=verified(sub))
    
    assert r1.json()["id"] == r2.json()["id"]

def test_partial_unique_index(database):
    # the partial unique index actually prevents two open applications — insert directly, bypassing the route
    sub = new_sub()
    from sqlalchemy.orm import Session
    with Session(database.engine) as session:
        user = User(auth_subject=sub, username="testuser", display_name="Test")
        session.add(user)
        session.flush()
        
        app1 = AmbassadorApplication(user_id=user.id, status="pending", form_version=1, answers={}, idempotency_key="1")
        session.add(app1)
        session.commit()
        
        app2 = AmbassadorApplication(user_id=user.id, status="under_review", form_version=1, answers={}, idempotency_key="2")
        session.add(app2)
        import sqlalchemy.exc
        with pytest.raises(sqlalchemy.exc.IntegrityError):
            session.commit()

def test_validation_unknown_key(client, settings):
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    r = client.post("/v1/ambassador/application", json={"answers": {"unknown": "x"}, "idempotency_key": "1"}, headers=verified(sub))
    assert r.status_code == 422
    assert "Unknown field" in r.json()["detail"]


def test_validation_missing_required(client, settings):
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x"}, "idempotency_key": "2"}, headers=verified(sub))
    assert r.status_code == 422
    assert "Missing required" in r.json()["detail"]


def test_validation_select_outside_options(client, settings):
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x", "ideas": "y", "role": "Fake"}, "idempotency_key": "3"}, headers=verified(sub))
    assert r.status_code == 422
    assert "one of the options" in r.json()["detail"]


def test_validation_over_max_length(client, settings):
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x"*501, "ideas": "y", "role": "Student"}, "idempotency_key": "4"}, headers=verified(sub))
    assert r.status_code == 422
    assert "at most" in r.json()["detail"]

def test_form_version_stored(client, settings, database):
    # form_version is stored with the application
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    answers = {"why": "reason", "ideas": "some ideas", "role": "Student"}
    r = client.post("/v1/ambassador/application", json={"answers": answers, "idempotency_key": "key1"}, headers=verified(sub))
    
    app_id = r.json()["id"]
    from sqlalchemy.orm import Session
    with Session(database.engine) as session:
        app = session.get(AmbassadorApplication, uuid.UUID(app_id))
        assert app.form_version == 1

def test_admin_decision(client, settings, database):
    # admin decision moves status, sets decided_at and notifies
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    admin_sub = new_sub()
    
    # create application
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "reason", "ideas": "some ideas", "role": "Student"}, "idempotency_key": "key1"}, headers=verified(sub))
    app_id = r.json()["id"]
    
    # create admin
    client.get("/v1/users/me/profile", headers=verified(admin_sub))
    with database.engine.begin() as conn:
        conn.execute(User.__table__.update().where(User.auth_subject == admin_sub).values(role="admin"))
        
    r = client.post(f"/v1/admin/ambassador/applications/{app_id}/decision", json={"status": "approved", "message": "Congrats"}, headers=verified(admin_sub))
    assert r.status_code == 200
    assert r.json()["status"] == "approved"
    assert r.json()["decided_at"] is not None
    
    # check notification
    r = client.get("/v1/notifications", headers=verified(sub))
    items = r.json()["items"]
    assert any(n["kind"] == "ambassador" for n in items)

def test_non_admin_refused(client, settings):
    # a non-admin calling an admin route is refused
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    r = client.get("/v1/admin/ambassador/applications?status=pending", headers=verified(sub))
    assert r.status_code == 403

def test_after_rejection(client, settings, database):
    # after rejection: open:false with "reapply_later", and allowed once the window has passed
    object.__setattr__(settings, "ambassador_open", True)
    object.__setattr__(settings, "ambassador_reapply_days", 30)
    sub = new_sub()
    admin_sub = new_sub()
    
    # create application
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "reason", "ideas": "some ideas", "role": "Student"}, "idempotency_key": "key1"}, headers=verified(sub))
    app_id = r.json()["id"]
    
    # create admin
    client.get("/v1/users/me/profile", headers=verified(admin_sub))
    with database.engine.begin() as conn:
        conn.execute(User.__table__.update().where(User.auth_subject == admin_sub).values(role="admin"))
        
    client.post(f"/v1/admin/ambassador/applications/{app_id}/decision", json={"status": "rejected", "message": "Sorry"}, headers=verified(admin_sub))
    
    # getting state
    r = client.get("/v1/ambassador/application", headers=verified(sub))
    assert r.json()["open"] is False
    assert r.json()["closed_reason"] == "reapply_later"
    
    # move decided_at past window
    from sqlalchemy.orm import Session
    with Session(database.engine) as session:
        app = session.get(AmbassadorApplication, uuid.UUID(app_id))
        app.decided_at = utcnow() - timedelta(days=31)
        session.commit()
        
    r = client.get("/v1/ambassador/application", headers=verified(sub))
    assert r.json()["open"] is True

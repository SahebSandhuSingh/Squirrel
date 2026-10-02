import re

with open("tests/test_ambassador.py", "r", encoding="utf-8") as f:
    content = f.read()

# Fix existing tests for E2 (closed_reason string)
content = content.replace('assert r.json()["closed_reason"] == "reapply_later"', 'assert "You can apply again on" in r.json()["closed_reason"]')
content = content.replace('assert r.json()["closed_reason"] == "verify_email"', 'assert "Verify your college email" in r.json()["closed_reason"]')

# Add E1, E3, E4 tests
new_tests = '''
def test_post_gate_unverified(client, settings, database):
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub(verified=False)
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x", "ideas": "y", "role": "Student"}, "idempotency_key": "x"}, headers=auth(sub))
    assert r.status_code == 403
    assert "Verify your college email" in r.json()["detail"]
    
    # Assert row count
    from sqlalchemy import select, func
    with database.engine.connect() as conn:
        assert conn.scalar(select(func.count()).select_from(AmbassadorApplication)) == 0

def test_post_gate_closed(client, settings, database):
    object.__setattr__(settings, "ambassador_open", False)
    sub = new_sub()
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x", "ideas": "y", "role": "Student"}, "idempotency_key": "x"}, headers=verified(sub))
    assert r.status_code == 403
    assert "Applications are currently closed" in r.json()["detail"]
    
    from sqlalchemy import select, func
    with database.engine.connect() as conn:
        assert conn.scalar(select(func.count()).select_from(AmbassadorApplication)) == 0

def test_post_gate_reapply_window(client, settings, database):
    object.__setattr__(settings, "ambassador_open", True)
    object.__setattr__(settings, "ambassador_reapply_days", 30)
    sub = new_sub()
    admin_sub = new_sub()
    
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "reason", "ideas": "y", "role": "Student"}, "idempotency_key": "key1"}, headers=verified(sub))
    app_id = r.json()["id"]
    
    client.get("/v1/users/me/profile", headers=verified(admin_sub))
    with database.engine.begin() as conn:
        conn.execute(User.__table__.update().where(User.auth_subject == admin_sub).values(role="admin"))
        
    client.post(f"/v1/admin/ambassador/applications/{app_id}/decision", json={"status": "rejected", "message": "Sorry"}, headers=verified(admin_sub))
    
    # Inside window
    r2 = client.post("/v1/ambassador/application", json={"answers": {"why": "x", "ideas": "y", "role": "Student"}, "idempotency_key": "key2"}, headers=verified(sub))
    assert r2.status_code == 403
    assert "cannot reapply" in r2.json()["detail"]
    
    from sqlalchemy import select, func
    with database.engine.connect() as conn:
        assert conn.scalar(select(func.count()).select_from(AmbassadorApplication)) == 1

def test_race_integrity_error_caught(client, settings, database):
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    client.get("/v1/users/me/profile", headers=verified(sub))
    
    # insert directly
    from sqlalchemy.orm import Session
    from sqlalchemy import select
    with Session(database.engine) as session:
        user = session.scalar(select(User).where(User.auth_subject == sub))
        app1 = AmbassadorApplication(user_id=user.id, status="pending", form_version=1, answers={}, idempotency_key="1")
        session.add(app1)
        session.commit()
    
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x", "ideas": "y", "role": "Student"}, "idempotency_key": "2"}, headers=verified(sub))
    assert r.status_code == 200
    # should return the existing one, not the new idempotency_key
    assert r.json()["id"] is not None

def test_decision_transitions(client, settings, database):
    object.__setattr__(settings, "ambassador_open", True)
    sub = new_sub()
    admin_sub = new_sub()
    client.get("/v1/users/me/profile", headers=verified(admin_sub))
    with database.engine.begin() as conn:
        conn.execute(User.__table__.update().where(User.auth_subject == admin_sub).values(role="admin"))
        
    r = client.post("/v1/ambassador/application", json={"answers": {"why": "x", "ideas": "y", "role": "Student"}, "idempotency_key": "1"}, headers=verified(sub))
    app_id = r.json()["id"]
    
    # valid: pending -> under_review
    r = client.post(f"/v1/admin/ambassador/applications/{app_id}/decision", json={"status": "under_review", "message": "x"}, headers=verified(admin_sub))
    assert r.status_code == 200
    
    # valid: under_review -> approved
    r = client.post(f"/v1/admin/ambassador/applications/{app_id}/decision", json={"status": "approved", "message": "x"}, headers=verified(admin_sub))
    assert r.status_code == 200
    
    # invalid: approved -> rejected (already decided)
    r = client.post(f"/v1/admin/ambassador/applications/{app_id}/decision", json={"status": "rejected", "message": "x"}, headers=verified(admin_sub))
    assert r.status_code == 409
    
def test_decision_unknown_app(client, settings, database):
    admin_sub = new_sub()
    client.get("/v1/users/me/profile", headers=verified(admin_sub))
    with database.engine.begin() as conn:
        conn.execute(User.__table__.update().where(User.auth_subject == admin_sub).values(role="admin"))
    
    import uuid
    r = client.post(f"/v1/admin/ambassador/applications/{uuid.uuid4()}/decision", json={"status": "approved", "message": "x"}, headers=verified(admin_sub))
    assert r.status_code == 404
'''

content += new_tests

with open("tests/test_ambassador.py", "w", encoding="utf-8") as f:
    f.write(content)

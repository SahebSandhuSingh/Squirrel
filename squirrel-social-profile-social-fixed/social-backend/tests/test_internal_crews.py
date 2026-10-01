"""POST /internal/v1/crews/memberships and /crews/lookup: crews for campus-service, by login subject (ADR-032)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.models import User
from tests.conftest import auth, new_sub
from tests.test_crews_events import crew

SVC = {"Authorization": "Bearer svc-secret"}


def memberships(client, *subjects) -> list[dict]:
    r = client.post("/internal/v1/crews/memberships", json={"subjects": list(subjects)}, headers=SVC)
    assert r.status_code == 200, r.text
    return r.json()["people"]


def lookup(client, *ids) -> list[dict]:
    r = client.post("/internal/v1/crews/lookup", json={"crew_ids": [str(i) for i in ids]}, headers=SVC)
    assert r.status_code == 200, r.text
    return r.json()["crews"]


def test_memberships_oldest_first_by_subject(client, api, database):
    owner, member, loner, unseen = new_sub(), new_sub(), new_sub(), new_sub()
    for s in (owner, member, loner):
        api.user(s)
    first = crew(client, owner, "Early Birds")
    second = crew(client, member, "Night Owls")
    client.post(f"/v1/crews/{first['id']}/join", headers=auth(member))

    people = memberships(client, member, owner, loner, unseen, owner)
    assert [p["subject"] for p in people] == [member, owner, loner, unseen]  # request order, each once
    m, o, lo, un = people
    assert [(c["id"], c["name"], c["role"]) for c in m["crews"]] == [(second["id"], "Night Owls", "owner"), (first["id"], "Early Birds", "member")]
    assert [(c["id"], c["role"]) for c in o["crews"]] == [(first["id"], "owner")]
    assert lo["crews"] == [] and un["crews"] == []
    with database.SessionLocal() as db:  # a lookup never creates a profile
        assert db.scalar(select(func.count()).select_from(User).where(User.auth_subject == unseen)) == 0


def test_leaving_shows_at_once(client, api):
    owner, member = new_sub(), new_sub()
    api.user(owner), api.user(member)
    c = crew(client, owner)
    client.post(f"/v1/crews/{c['id']}/join", headers=auth(member))
    assert len(memberships(client, member)[0]["crews"]) == 1
    client.delete(f"/v1/crews/{c['id']}/membership", headers=auth(member))
    assert memberships(client, member)[0]["crews"] == []


def test_lookup_crews_with_members(client, api):
    owner, member = new_sub(), new_sub()
    api.user(owner), api.user(member)
    c = crew(client, owner, "Early Birds", hostel=None)
    client.post(f"/v1/crews/{c['id']}/join", headers=auth(member))
    missing = uuid.uuid4()
    [found] = lookup(client, missing, c["id"], c["id"])
    assert found["id"] == c["id"] and found["name"] == "Early Birds" and found["members_count"] == 2
    assert found["interest"] == "running" and found["scope"] in ("campus", "online")
    assert [(m["subject"], m["role"]) for m in found["members"]] == [(owner, "owner"), (member, "member")]
    assert lookup(client, missing) == []  # unknown ids are left out, not a 404


def test_service_token_and_limits(client):
    sub = new_sub()
    assert client.post("/internal/v1/crews/memberships", json={"subjects": [sub]}).status_code == 401
    assert client.post("/internal/v1/crews/memberships", json={"subjects": [sub]}, headers=auth(sub)).status_code == 401
    assert client.post("/internal/v1/crews/lookup", json={"crew_ids": [str(uuid.uuid4())]}).status_code == 401
    assert client.post("/internal/v1/crews/memberships", json={"subjects": []}, headers=SVC).status_code == 422
    assert client.post("/internal/v1/crews/memberships", json={"subjects": [new_sub() for _ in range(201)]}, headers=SVC).status_code == 422

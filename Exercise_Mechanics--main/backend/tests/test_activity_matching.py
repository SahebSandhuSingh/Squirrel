"""Activity matching: members who share an activity are suggested to each other as workout partners.

USERS_DIR is monkeypatched to a temp dir so nothing touches data/users.
"""

from __future__ import annotations

import asyncio
import itertools
import json
import random
from datetime import date

import pytest
from fastapi import FastAPI

from backend import config
from backend.activity_matching import scoring
from backend.activity_matching.features import MatchingProfile
from backend.activity_matching.router import router as matching_router
from backend.partners import store as blocks_store
from backend.profiles import store as profile_store
from backend.profiles.router import router as profiles_router
from backend.users.router import router as users_router

MATCHING = {"category": "matching", "granted": True, "policy_version": "2026-09"}
HABITS = {"category": "habits", "granted": True, "policy_version": "2026-09"}


def _app() -> FastAPI:
    app = FastAPI()
    for router in (users_router, profiles_router, matching_router):
        app.include_router(router)
    return app


def _request(method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    body = json.dumps(payload).encode() if payload is not None else b""
    sent = False
    messages: list[dict] = []

    async def receive() -> dict:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message: dict) -> None:
        messages.append(message)

    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"}, "http_version": "1.1",
        "method": method, "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"",
        "root_path": "", "headers": [(b"host", b"test"), (b"content-type", b"application/json")],
        "client": ("127.0.0.1", 12345), "server": ("test", 80),
    }
    asyncio.run(_app()(scope, receive, send))
    start = next(m for m in messages if m["type"] == "http.response.start")
    raw = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return start["status"], json.loads(raw)


def member(first: str, activities: dict[str, int], *, level="intermediate", opted_in=True,
           dob="1995-06-15", times: list[str] | None = None) -> str:
    """Sign up (page 1), then answer page 2: activities with interest, fitness level, consents."""
    status, body = _request("POST", "/api/users", {
        "first_name": first, "last_name": "Tester", "gender": "female", "height_cm": 170, "weight_kg": 65,
        "date_of_birth": dob, "mobile": "9990001111", "email": f"{first.lower()}@example.test"})
    assert status == 200, body
    uid = body["user_id"]
    consents = ([MATCHING] if opted_in else []) + ([HABITS] if times else [])
    details = {
        "fitness": {"fitness_level": level},
        "activities": [{"activity": a, "interest": i} for a, i in activities.items()],
        "consents": consents,
    }
    if times:
        details["habits"] = {"preferred_workout_times": times}
    status, body = _request("PUT", f"/api/users/{uid}/details", details)
    assert status == 200, body
    return uid


def matches(uid: str) -> list[dict]:
    status, body = _request("GET", f"/api/users/{uid}/activity-matches")
    assert status == 200, body
    return body["matches"]


def ids(uid: str) -> list[str]:
    return [m["user_id"] for m in matches(uid)]


@pytest.fixture(autouse=True)
def isolated_users(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path)


# ---------------------------------------------------------------- who gets paired

def test_two_runners_are_suggested_to_each_other_with_the_same_score():
    ana = member("Ana", {"running": 5})
    ben = member("Ben", {"running": 4, "yoga": 2})
    [for_ana], [for_ben] = matches(ana), matches(ben)
    assert for_ana["user_id"] == ben and for_ben["user_id"] == ana
    assert for_ana["score"] == for_ben["score"]
    assert for_ana["shared_activities"] == [{"activity": "running", "label": "Running"}]
    assert "You both do running." in for_ana["reasons"]
    assert "Running is a favourite for both of you." in for_ana["reasons"]


def test_no_shared_activity_means_no_suggestion():
    runner = member("Ana", {"running": 5})
    member("Ben", {"yoga": 5})
    assert matches(runner) == []


def test_both_members_must_opt_in():
    ana = member("Ana", {"running": 5})
    member("Ben", {"running": 5}, opted_in=False)
    assert matches(ana) == []
    lurker = member("Cat", {"running": 5}, opted_in=False)
    status, body = _request("GET", f"/api/users/{lurker}/activity-matches")
    assert status == 403 and body["detail"]["code"] == "matching_consent_required"


def test_withdrawing_consent_takes_effect_immediately():
    ana, ben = member("Ana", {"running": 5}), member("Ben", {"running": 5})
    assert ids(ana) == [ben]
    _request("POST", f"/api/users/{ben}/consents", {**MATCHING, "granted": False})
    assert matches(ana) == []


def test_minors_never_match_or_browse():
    adult = member("Ana", {"running": 5})
    kid = member("Kid", {"running": 5}, dob=f"{date.today().year - 15}-01-01")
    assert matches(adult) == []
    status, body = _request("GET", f"/api/users/{kid}/activity-matches")
    assert status == 403 and body["detail"]["code"] == "age_restricted"


def test_members_without_activities_are_asked_to_add_some():
    ana = member("Ana", {})
    status, body = _request("GET", f"/api/users/{ana}/activity-matches")
    assert status == 409 and body["detail"]["code"] == "activities_required"


# ---------------------------------------------------------------- how they're ranked

def test_higher_shared_interest_ranks_first():
    ana = member("Ana", {"running": 5})
    keen = member("Ben", {"running": 5})
    casual = member("Cat", {"running": 1})
    assert ids(ana) == [keen, casual]


def test_closer_fitness_level_ranks_first():
    ana = member("Ana", {"strength_training": 4}, level="beginner")
    same = member("Ben", {"strength_training": 4}, level="beginner")
    far = member("Cat", {"strength_training": 4}, level="advanced")
    ranked = matches(ana)
    assert [m["user_id"] for m in ranked] == [same, far]
    assert "You're both beginner." in ranked[0]["reasons"]


def test_workout_times_count_only_when_both_share_them():
    ana = member("Ana", {"running": 5}, times=["morning", "evening"])
    early = member("Ben", {"running": 5}, times=["morning"])
    late = member("Cat", {"running": 5}, times=["night"])
    private = member("Dev", {"running": 5})
    ranked = {m["user_id"]: m for m in matches(ana)}
    assert "You both like to train in the morning." in ranked[early]["reasons"]
    assert ranked[early]["score"] > ranked[private]["score"] > ranked[late]["score"]
    assert not any("train in" in r for r in ranked[private]["reasons"])


def test_sharing_several_activities_helps_and_is_listed_strongest_first():
    ana = member("Ana", {"running": 3, "yoga": 5, "cycling": 4})
    both = member("Ben", {"running": 3, "yoga": 5, "cycling": 4})
    one = member("Cat", {"yoga": 5})
    ranked = matches(ana)
    assert ranked[0]["user_id"] == both
    assert [a["activity"] for a in ranked[0]["shared_activities"]] == ["yoga", "cycling", "running"]
    assert ranked[0]["score"] > next(m for m in ranked if m["user_id"] == one)["score"]


def _profile(uid: str, interests: dict, level: str, times) -> MatchingProfile:
    return MatchingProfile(uid, uid.capitalize(), "T", 30, level, interests, times, True, True)


def test_scores_are_symmetric_and_bounded():
    rng = random.Random(7)
    codes = ["running", "yoga", "cycling", "hiit", "pushup"]
    people = [
        _profile(f"p{i}", {c: rng.randint(1, 5) for c in rng.sample(codes, rng.randint(1, 3))},
                 rng.choice(["beginner", "intermediate", "advanced"]),
                 frozenset(rng.sample(["morning", "evening", "night"], rng.randint(1, 2))) if rng.random() < .6 else None)
        for i in range(12)
    ]
    for a, b in itertools.combinations(people, 2):
        if scoring.shared_activities(a, b):
            ab, ba = scoring.score(a, b), scoring.score(b, a)
            assert ab.score == ba.score and 0 <= ab.score <= 100


def test_ties_are_ordered_stably_and_the_list_is_capped():
    viewer = _profile("a", {"running": 5}, "beginner", None)
    others = [(_profile(f"u{i:03d}", {"running": 5}, "beginner", None), frozenset()) for i in range(60)]
    ranked = scoring.rank(viewer, list(reversed(others)), frozenset())
    assert len(ranked) == scoring.MAX_MATCHES
    assert [m.user_id for m in ranked] == [f"u{i:03d}" for i in range(scoring.MAX_MATCHES)]


# ---------------------------------------------------------------- safety

def test_a_block_hides_both_people_from_each_other_and_is_shared_with_partner_hunt():
    ana, ben = member("Ana", {"running": 5}), member("Ben", {"running": 5})
    status, _ = _request("POST", f"/api/users/{ana}/activity-matches/blocks", {"user_id": ben})
    assert status == 200
    assert matches(ana) == [] and matches(ben) == []
    assert ben in blocks_store.read_blocks(ana)


def test_blocking_yourself_or_nobody_is_refused():
    ana = member("Ana", {"running": 5})
    assert _request("POST", f"/api/users/{ana}/activity-matches/blocks", {"user_id": ana})[0] == 400
    assert _request("POST", f"/api/users/{ana}/activity-matches/blocks", {"user_id": "nobody-123456"})[0] == 404


def test_unreadable_data_fails_closed():
    ana, ben, cat = (member(n, {"running": 5}) for n in ("Ana", "Ben", "Cat"))
    # A candidate whose consent can't be confirmed is not shown.
    (config.user_dir(ben) / profile_store.CONSENTS_FILENAME).write_text("{not json")
    # A candidate whose block list can't be read might have blocked Ana: not shown either.
    (config.user_dir(cat) / blocks_store.BLOCKS_FILENAME).write_text("{not json")
    assert matches(ana) == []
    # And the viewer's own unreadable files stop the board rather than guessing.
    status, body = _request("GET", f"/api/users/{ben}/activity-matches")
    assert status == 503 and body["detail"]["code"] == "consents_unreadable"
    status, body = _request("GET", f"/api/users/{cat}/activity-matches")
    assert status == 500 and body["detail"]["code"] == "blocks_unreadable"


def test_a_match_card_reveals_nothing_beyond_the_matching_view():
    ana = member("Ana", {"running": 5})
    member("Ben", {"running": 4, "yoga": 5})
    [card] = matches(ana)
    assert set(card) == {"user_id", "display_name", "age_band", "fitness_level", "score",
                         "shared_activities", "reasons"}
    assert card["display_name"] == "Ben T." and card["age_band"] == "25–34"
    # Only the activities they share with Ana — not Ben's yoga, and never his interest scores.
    assert card["shared_activities"] == [{"activity": "running", "label": "Running"}]


# ---------------------------------------------------------------- status

def test_status_says_what_is_missing_and_what_matches_will_see():
    ana = member("Ana", {"running": 5, "yoga": 3}, times=["evening"])
    status, body = _request("GET", f"/api/users/{ana}/activity-matching")
    assert status == 200 and body["ready"] is True and body["missing"] == []
    assert body["activities"][0] == {"activity": "running", "label": "Running", "interest": 5}
    assert body["shared_with_matches"] == {"display_name": "Ana T.", "age_band": "25–34",
                                           "fitness_level": "intermediate",
                                           "activities": ["Running", "Yoga"], "workout_times": ["evening"]}
    new = member("Ben", {}, opted_in=False)
    assert _request("GET", f"/api/users/{new}/activity-matching")[1]["missing"] == ["matching_consent", "activities"]


def test_user_ids_are_checked():
    assert _request("GET", "/api/users/Bad_ID/activity-matches")[0] == 400
    assert _request("GET", "/api/users/nobody-123456/activity-matches")[0] == 404
    assert _request("GET", "/api/users/nobody-123456/activity-matching")[0] == 404


def test_pairing_rules_apply_to_both_sides():
    a = _profile("a", {"running": 5}, "beginner", None)
    b = _profile("b", {"running": 5}, "beginner", None)
    hidden = MatchingProfile("a", "A", "T", 30, "beginner", {"running": 5}, None, False, True)
    minor = MatchingProfile("a", "A", "T", 16, "beginner", {"running": 5}, None, True, True)
    assert scoring.exclusion_reason(a, b, frozenset(), frozenset()) is None
    assert scoring.exclusion_reason(hidden, b, frozenset(), frozenset()) == "not_opted_in"
    assert scoring.exclusion_reason(minor, b, frozenset(), frozenset()) == "age"
    assert scoring.exclusion_reason(a, b, frozenset(), frozenset({"a"})) == "blocked"


def test_workout_times_are_never_used_without_habits_consent():
    ana = member("Ana", {"running": 5})
    # e.g. a habits file left behind by a failed erasure: present on disk, but not consented
    profile_store.write_section(ana, "habits", {"preferred_workout_times": ["morning"]})
    ben = member("Ben", {"running": 5}, times=["morning"])
    assert _request("GET", f"/api/users/{ana}/activity-matching")[1]["shared_with_matches"]["workout_times"] is None
    assert not any("train in" in r for r in matches(ben)[0]["reasons"])

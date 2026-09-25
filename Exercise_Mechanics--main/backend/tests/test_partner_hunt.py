"""Partner Hunt: the XP gate, two-way eligibility, ranking, blocking and the REST contract.

The properties that matter most here are safety properties, and most tests are about them: a user
never appears to someone they excluded or blocked, nobody gets in on an XP read that did not happen,
and a card never carries more personal data than it needs.
"""

from __future__ import annotations

import asyncio
import io
import json
import urllib.error
from datetime import date

import pytest
from fastapi import FastAPI

from backend import config
from backend.partners import store
from backend.partners.matching import (
    Person,
    Preferences,
    age_band,
    age_on,
    display_name,
    exclusion_reason,
    rank,
    score,
    shared_modes,
)
from backend.partners.policy import PARTNER_HUNT_MIN_XP
from backend.partners.router import get_xp_gate, router as partners_router
from backend.partners.xp_gate import (
    FixedXPGate,
    RunModuleXPGate,
    UnconfiguredXPGate,
    XPServiceUnavailable,
    XPStatus,
    xp_gate_from_env,
)
from backend.users.store import create_user_record, write_skill

TODAY = date(2026, 9, 25)


# --- builders -----------------------------------------------------------------------------------------

def prefs(**overrides) -> dict:
    base = {
        "visible": True,
        "activities": ["running", "strength_training"],
        "mode": "either",
        "city": "Pune",
        "preferred_times": ["morning", "evening"],
        "partner_genders": [],
        "partner_age_min": 18,
        "partner_age_max": 60,
    }
    return {**base, **overrides}


def person(user_id: str, *, gender="female", age=30, level="intermediate", blocked=(), **pref_overrides) -> Person:
    raw = None if pref_overrides.get("_no_prefs") else prefs(**{k: v for k, v in pref_overrides.items() if k != "_no_prefs"})
    return Person(
        user_id=user_id,
        first_name=user_id.title(),
        last_name="Lastname",
        gender=gender,
        age=age,
        fitness_level=level,
        preferences=Preferences.from_dict(raw) if raw else None,
        blocked_ids=frozenset(blocked),
    )


class RecordingGate(FixedXPGate):
    """A fixed gate that records every call, so tests can see what was asked and with what minXP."""

    def __init__(self, xp_by_user=None, *, default_xp=0, unavailable_for=()):
        super().__init__(xp_by_user, default_xp=default_xp, updated_at="2026-09-25T08:00:00Z")
        self.calls: list[tuple[str, str, int | None]] = []
        self.unavailable_for = set(unavailable_for)

    def meets_xp_gate(self, user_id, min_xp):
        self.calls.append(("gate", user_id, min_xp))
        if user_id in self.unavailable_for:
            raise XPServiceUnavailable("down")
        return super().meets_xp_gate(user_id, min_xp)

    def get_user_xp(self, user_id):
        self.calls.append(("xp", user_id, None))
        if user_id in self.unavailable_for:
            raise XPServiceUnavailable("down")
        return super().get_user_xp(user_id)


# =====================================================================================================
# Eligibility — every preference rule runs in BOTH directions
# =====================================================================================================

def test_a_compatible_pair_sees_each_other():
    a, b = person("ana"), person("ben", gender="male")
    assert exclusion_reason(a, b) is None
    assert exclusion_reason(b, a) is None


def test_gender_preference_is_enforced_both_ways():
    # Ana only wants women. Ben is a man: he is off her board — and she is off HIS board too, even
    # though Ben set no preference. Showing Ana to Ben would put her in front of someone she excluded.
    ana = person("ana", partner_genders=["female"])
    ben = person("ben", gender="male")
    assert exclusion_reason(ana, ben) == "preferences"
    assert exclusion_reason(ben, ana) == "preferences"


def test_age_preference_is_enforced_both_ways():
    ana = person("ana", age=30, partner_age_min=25, partner_age_max=35)
    ben = person("ben", age=45)
    assert exclusion_reason(ana, ben) == "preferences"
    assert exclusion_reason(ben, ana) == "preferences"


def test_undisclosed_gender_never_satisfies_a_gender_restriction():
    ana = person("ana", partner_genders=["female", "male", "non_binary"])
    sam = person("sam", gender="undisclosed")
    # Every named gender is allowed, yet Sam is still excluded: the preference cannot be confirmed.
    assert exclusion_reason(ana, sam) == "preferences"
    # With no restriction, Sam matches normally.
    assert exclusion_reason(person("ben"), sam) is None


@pytest.mark.parametrize("age", [17, None])
def test_minors_and_unknown_ages_are_never_shown(age):
    viewer = person("ana")
    assert exclusion_reason(viewer, person("kid", age=age)) == "age"


def test_blocking_works_in_both_directions():
    ana, ben = person("ana", blocked=["ben"]), person("ben")
    assert exclusion_reason(ana, ben) == "blocked"
    assert exclusion_reason(ben, ana) == "blocked"


def test_invisible_users_and_users_without_preferences_are_not_shown():
    viewer = person("ana")
    assert exclusion_reason(viewer, person("ben", visible=False)) == "not_visible"
    assert exclusion_reason(viewer, person("ben", _no_prefs=True)) == "not_visible"
    assert exclusion_reason(viewer, viewer) == "self"


def test_in_person_requires_the_same_city_and_ignores_case_and_spacing():
    ana = person("ana", mode="in_person", city="Pune")
    assert exclusion_reason(ana, person("ben", mode="in_person", city="  pune ")) is None
    assert exclusion_reason(ana, person("ben", mode="in_person", city="Mumbai")) == "mode"
    # Someone open to either, in another city, can still only meet Ana in person — so no match.
    assert exclusion_reason(ana, person("ben", mode="either", city="Mumbai")) == "mode"


def test_a_card_names_the_city_the_way_the_viewer_spelled_it():
    match = score(person("ana", city="Pune"), person("ben", city="  pune "))
    assert match.city == "Pune"
    assert "Both in Pune, open to meeting up" in match.reasons


def test_either_falls_back_to_remote_when_cities_differ():
    a = Preferences.from_dict(prefs(mode="either", city="Pune"))
    b = Preferences.from_dict(prefs(mode="either", city="Delhi"))
    assert shared_modes(a, b) == {"remote"}
    assert shared_modes(a, Preferences.from_dict(prefs(mode="either", city="Pune"))) == {"in_person", "remote"}


def test_no_shared_activity_means_no_match():
    ana = person("ana", activities=["yoga"])
    assert exclusion_reason(ana, person("ben", activities=["running"])) == "activities"


# =====================================================================================================
# Ranking
# =====================================================================================================

def test_a_perfect_pair_scores_100_with_readable_reasons():
    match = score(person("ana"), person("ben"))
    assert match.score == 100
    assert match.reasons == (
        "Both into running and strength training",
        "Both train mornings and evenings",
        "Same level: intermediate",
        "Both in Pune, open to meeting up",
    )
    assert match.meet == ("in_person", "remote")


def test_partial_overlap_scores_lower_and_says_why():
    ana = person("ana", preferred_times=["morning"], activities=["running", "yoga"], mode="remote")
    ben = person("ben", level="advanced", preferred_times=["night"], activities=["running"], mode="remote")
    match = score(ana, ben)
    assert match.score < 60
    assert "Usually trains at different times" in match.reasons
    assert "Both open to training remotely" in match.reasons
    assert match.city is None  # remote only: no location on the card


def test_rank_orders_best_first_and_breaks_ties_by_id():
    viewer = person("ana")
    close = person("cat", level="advanced")          # one level apart
    perfect_b = person("bob")
    perfect_a = person("abe")
    matches = rank(viewer, [close, perfect_b, perfect_a], lambda _uid: True)
    assert [m.user_id for m in matches] == ["abe", "bob", "cat"]


def test_the_xp_gate_is_only_consulted_for_otherwise_eligible_people():
    asked: list[str] = []
    viewer = person("ana")
    people = [person("ben"), person("kid", age=15), person("zed", activities=["yoga"])]

    def gate(uid: str) -> bool:
        asked.append(uid)
        return True

    rank(viewer, people, gate)
    assert asked == ["ben"]  # no network call spent on people already ruled out


def test_a_candidate_who_fails_the_gate_is_not_shown():
    assert rank(person("ana"), [person("ben")], lambda _uid: False) == []


# =====================================================================================================
# Small helpers
# =====================================================================================================

def test_age_is_whole_years_and_rejects_bad_dates():
    assert age_on("2008-09-25", TODAY) == 18       # birthday today
    assert age_on("2008-09-26", TODAY) == 17       # birthday tomorrow
    assert age_on("2030-01-01", TODAY) is None     # born in the future
    assert age_on("not-a-date", TODAY) is None
    assert age_on(None, TODAY) is None


def test_cards_show_a_band_and_an_initial_never_the_full_detail():
    assert age_band(18) == "18–24" and age_band(34) == "25–34" and age_band(80) == "55+"
    assert display_name("saheb", "sandhu") == "saheb S."
    assert display_name("Ana", "") == "Ana"


# =====================================================================================================
# XP gate client
# =====================================================================================================

class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def opener_returning(payload, sink=None):
    def opener(request, timeout):
        if sink is not None:
            sink.append(request)
        return FakeResponse(json.dumps(payload).encode())
    return opener


@pytest.mark.parametrize("answer", [True, False])
def test_run_module_gate_returns_the_boolean_it_is_given(answer):
    sent = []
    gate = RunModuleXPGate("https://run.example/", token="t0k", opener=opener_returning(answer, sent))
    assert gate.meets_xp_gate("ana s/1", PARTNER_HUNT_MIN_XP) is answer
    request = sent[0]
    assert request.full_url == "https://run.example/v1/users/ana%20s%2F1/xp-gate?minXP=100"
    assert request.get_header("Authorization") == "Bearer t0k"


@pytest.mark.parametrize("answer", [1, "true", {"meets": True}, None])
def test_run_module_gate_refuses_anything_but_a_real_boolean(answer):
    gate = RunModuleXPGate("https://run.example", opener=opener_returning(answer))
    with pytest.raises(XPServiceUnavailable):
        gate.meets_xp_gate("ana", PARTNER_HUNT_MIN_XP)


def test_run_module_xp_lookup_parses_the_contract_shape():
    gate = RunModuleXPGate("https://run.example", opener=opener_returning({"xp": 40, "updatedAt": "2026-09-25T08:00:00Z"}))
    assert gate.get_user_xp("ana") == XPStatus(40, "2026-09-25T08:00:00Z")


@pytest.mark.parametrize("body", [{"xp": None}, {"xp": True}, {"xp": -5}, {"xp": "40"}, {"xp": 3, "updatedAt": 7}, [40]])
def test_a_malformed_xp_reply_is_unavailable_not_zero(body):
    gate = RunModuleXPGate("https://run.example", opener=opener_returning(body))
    with pytest.raises(XPServiceUnavailable):
        gate.get_user_xp("ana")


@pytest.mark.parametrize("error", [
    urllib.error.HTTPError("u", 500, "boom", {}, None),
    urllib.error.URLError("refused"),
    TimeoutError(),
])
def test_transport_failures_are_unavailable(error):
    def opener(request, timeout):
        raise error
    with pytest.raises(XPServiceUnavailable):
        RunModuleXPGate("https://run.example", opener=opener).meets_xp_gate("ana", 100)


def test_invalid_json_is_unavailable():
    gate = RunModuleXPGate("https://run.example", opener=lambda request, timeout: FakeResponse(b"<html>"))
    with pytest.raises(XPServiceUnavailable):
        gate.meets_xp_gate("ana", 100)


def test_gate_selection_from_environment():
    assert isinstance(xp_gate_from_env({}), UnconfiguredXPGate)
    assert isinstance(xp_gate_from_env({"RUN_MODULE_URL": "https://run.example"}), RunModuleXPGate)
    dev = xp_gate_from_env({"PARTNER_HUNT_DEV_XP": "150"})
    assert isinstance(dev, FixedXPGate) and dev.meets_xp_gate("anyone", 100)
    # The real Run Module always wins over the dev override.
    both = xp_gate_from_env({"RUN_MODULE_URL": "https://run.example", "PARTNER_HUNT_DEV_XP": "150"})
    assert isinstance(both, RunModuleXPGate)
    for bad in ({"PARTNER_HUNT_DEV_XP": "lots"}, {"PARTNER_HUNT_DEV_XP": "-1"}, {"RUN_MODULE_URL": "run.example"}):
        with pytest.raises(ValueError):
            xp_gate_from_env(bad)


def test_an_unconfigured_gate_never_opens():
    gate = UnconfiguredXPGate()
    with pytest.raises(XPServiceUnavailable):
        gate.meets_xp_gate("ana", 100)
    with pytest.raises(XPServiceUnavailable):
        gate.get_user_xp("ana")


# =====================================================================================================
# REST contract
# =====================================================================================================

def _app(gate) -> FastAPI:
    app = FastAPI()
    app.include_router(partners_router)
    app.dependency_overrides[get_xp_gate] = lambda: gate
    return app


def _request(app: FastAPI, method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    """Dependency-free ASGI client, same approach as test_sessions."""
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
    asyncio.run(app(scope, receive, send))
    start = next(m for m in messages if m["type"] == "http.response.start")
    raw = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return start["status"], json.loads(raw)


def _user(first: str, *, gender="female", dob="1994-05-10", level="intermediate") -> str:
    user_id = create_user_record({
        "first_name": first.capitalize(), "last_name": "Tester", "gender": gender, "height_cm": 170.0,
        "weight_kg": 65.0, "date_of_birth": dob, "mobile": "9990001111", "email": f"{first}@example.test",
    })["user_id"]
    write_skill(user_id, level)
    return user_id


@pytest.fixture(autouse=True)
def isolated_users(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path)


def test_status_reports_a_locked_user_with_their_progress():
    ana = _user("ana")
    gate = RecordingGate({ana: 40})
    status, body = _request(_app(gate), "GET", f"/api/users/{ana}/partner-hunt")
    assert status == 200
    assert body["min_xp"] == 100
    assert body["xp"] == {"available": True, "xp": 40, "updated_at": "2026-09-25T08:00:00Z"}
    assert body["unlocked"] is False and body["ready"] is False
    assert body["preferences"] is None and body["age_eligible"] is True


def test_status_tells_unavailable_apart_from_locked():
    ana = _user("ana")
    status, body = _request(_app(UnconfiguredXPGate()), "GET", f"/api/users/{ana}/partner-hunt")
    assert status == 200
    assert body["xp"] == {"available": False, "xp": None, "updated_at": None}
    assert body["unlocked"] is False


def test_the_gate_is_always_asked_for_exactly_100_xp():
    ana, ben = _user("ana"), _user("ben", gender="male")
    gate = RecordingGate(default_xp=500)
    app = _app(gate)
    for uid in (ana, ben):
        assert _request(app, "PUT", f"/api/users/{uid}/partner-hunt/preferences", prefs())[0] == 200
    _request(app, "GET", f"/api/users/{ana}/partner-hunt")
    _request(app, "GET", f"/api/users/{ana}/partner-hunt/matches")
    gate_calls = [call for call in gate.calls if call[0] == "gate"]
    assert gate_calls and all(min_xp == 100 for _, _, min_xp in gate_calls)


def test_two_unlocked_compatible_users_see_each_other_and_nothing_private():
    ana, ben = _user("ana"), _user("ben", gender="male")
    app = _app(RecordingGate(default_xp=150))
    for uid in (ana, ben):
        _request(app, "PUT", f"/api/users/{uid}/partner-hunt/preferences", prefs())

    status, body = _request(app, "GET", f"/api/users/{ana}/partner-hunt/matches")
    assert status == 200 and body["min_xp"] == 100
    [card] = body["matches"]
    assert card["user_id"] == ben and card["display_name"] == "Ben T." and card["score"] == 100
    # The card carries only what a stranger needs to decide. None of the profile's personal fields.
    assert set(card) == {
        "user_id", "display_name", "age_band", "fitness_level", "shared_activities",
        "shared_times", "meet", "city", "score", "reasons",
    }
    serialized = json.dumps(card)
    for private in ("9990001111", "@example.test", "1994-05-10", "Tester", "170", "65"):
        assert private not in serialized

    status, body = _request(app, "GET", f"/api/users/{ben}/partner-hunt/matches")
    assert [card["user_id"] for card in body["matches"]] == [ana]


def test_a_candidate_below_100_xp_does_not_appear():
    ana, ben = _user("ana"), _user("ben", gender="male")
    app = _app(RecordingGate({ana: 100, ben: 99}))
    for uid in (ana, ben):
        _request(app, "PUT", f"/api/users/{uid}/partner-hunt/preferences", prefs())
    status, body = _request(app, "GET", f"/api/users/{ana}/partner-hunt/matches")
    assert status == 200 and body["matches"] == []


def test_a_candidate_whose_xp_cannot_be_checked_does_not_appear():
    ana, ben = _user("ana"), _user("ben", gender="male")
    app = _app(RecordingGate(default_xp=500, unavailable_for=[ben]))
    for uid in (ana, ben):
        _request(app, "PUT", f"/api/users/{uid}/partner-hunt/preferences", prefs())
    assert _request(app, "GET", f"/api/users/{ana}/partner-hunt/matches")[1]["matches"] == []


@pytest.mark.parametrize(("setup", "expected_status", "expected_code"), [
    ("locked", 403, "xp_locked"),
    ("unavailable", 503, "xp_unavailable"),
    ("no_preferences", 409, "preferences_required"),
    ("hidden", 409, "preferences_required"),
    ("minor", 403, "age_restricted"),
])
def test_the_board_explains_exactly_what_blocks_it(setup, expected_status, expected_code):
    ana = _user("ana", dob="2010-01-01" if setup == "minor" else "1994-05-10")
    gate = {
        "locked": RecordingGate({ana: 40}),
        "unavailable": UnconfiguredXPGate(),
    }.get(setup, RecordingGate(default_xp=500))
    if setup == "hidden":
        store.write_preferences(ana, prefs(visible=False))
    elif setup in ("locked", "unavailable"):
        store.write_preferences(ana, prefs())

    status, body = _request(_app(gate), "GET", f"/api/users/{ana}/partner-hunt/matches")
    assert status == expected_status
    assert body["detail"]["code"] == expected_code
    if setup == "locked":
        assert body["detail"]["xp"] == 40 and body["detail"]["min_xp"] == 100


def test_preferences_can_be_saved_while_still_locked():
    ana = _user("ana")
    status, body = _request(_app(RecordingGate({ana: 0})), "PUT", f"/api/users/{ana}/partner-hunt/preferences", prefs())
    assert status == 200 and body["activities"] == ["running", "strength_training"]


def test_a_minor_cannot_save_preferences():
    kid = _user("kid", dob="2012-03-03")
    status, body = _request(_app(RecordingGate()), "PUT", f"/api/users/{kid}/partner-hunt/preferences", prefs())
    assert status == 403 and body["detail"]["code"] == "age_restricted"


def test_remote_only_preferences_do_not_keep_a_location():
    ana = _user("ana")
    _, body = _request(_app(RecordingGate()), "PUT", f"/api/users/{ana}/partner-hunt/preferences",
                       prefs(mode="remote", city="Pune"))
    assert body["city"] is None
    assert store.read_preferences(ana)["city"] is None


@pytest.mark.parametrize("bad", [
    prefs(mode="in_person", city="  "),
    prefs(partner_age_min=40, partner_age_max=30),
    prefs(partner_age_min=16),
    prefs(activities=[]),
    prefs(activities=["running", "running"]),
    prefs(activities=["swimming"]),
    prefs(preferred_times=["lunch"]),
    prefs(partner_genders=["undisclosed"]),
    {**prefs(), "email": "leak@example.test"},
])
def test_invalid_preferences_are_rejected(bad):
    ana = _user("ana")
    status, _ = _request(_app(RecordingGate()), "PUT", f"/api/users/{ana}/partner-hunt/preferences", bad)
    assert status == 422


def test_blocking_hides_both_people_from_each_other_immediately():
    ana, ben = _user("ana"), _user("ben", gender="male")
    app = _app(RecordingGate(default_xp=500))
    for uid in (ana, ben):
        _request(app, "PUT", f"/api/users/{uid}/partner-hunt/preferences", prefs())
    assert _request(app, "GET", f"/api/users/{ana}/partner-hunt/matches")[1]["matches"]

    status, body = _request(app, "POST", f"/api/users/{ben}/partner-hunt/blocks", {"user_id": ana})
    assert status == 200 and body == {"blocked_user_id": ana}
    assert _request(app, "GET", f"/api/users/{ana}/partner-hunt/matches")[1]["matches"] == []
    assert _request(app, "GET", f"/api/users/{ben}/partner-hunt/matches")[1]["matches"] == []

    # Blocking twice is harmless, and saving preferences afterwards does not lift the block.
    assert _request(app, "POST", f"/api/users/{ben}/partner-hunt/blocks", {"user_id": ana})[0] == 200
    _request(app, "PUT", f"/api/users/{ben}/partner-hunt/preferences", prefs(mode="remote"))
    assert store.read_blocks(ben) == {ana}


def test_block_rejects_self_unknown_and_malformed_ids():
    ana = _user("ana")
    app = _app(RecordingGate())
    assert _request(app, "POST", f"/api/users/{ana}/partner-hunt/blocks", {"user_id": ana})[0] == 400
    assert _request(app, "POST", f"/api/users/{ana}/partner-hunt/blocks", {"user_id": "nobody-000000"})[0] == 404
    assert _request(app, "POST", f"/api/users/{ana}/partner-hunt/blocks", {"user_id": "../etc"})[0] == 400


def test_an_unreadable_block_list_never_re_exposes_anyone():
    ana, ben, cat = _user("ana"), _user("ben", gender="male"), _user("cat")
    app = _app(RecordingGate(default_xp=500))
    for uid in (ana, ben, cat):
        _request(app, "PUT", f"/api/users/{uid}/partner-hunt/preferences", prefs())

    # Ben's block list is corrupt: we cannot know whether he blocked Ana, so he is left off her board.
    (config.user_dir(ben) / store.BLOCKS_FILENAME).write_text("{not json")
    assert [m["user_id"] for m in _request(app, "GET", f"/api/users/{ana}/partner-hunt/matches")[1]["matches"]] == [cat]

    # Ben's own board is withheld entirely rather than shown without his blocks applied.
    status, body = _request(app, "GET", f"/api/users/{ben}/partner-hunt/matches")
    assert status == 500 and body["detail"]["code"] == "blocks_unreadable"
    # And a new block is refused rather than overwriting — and silently lifting — the old ones.
    assert _request(app, "POST", f"/api/users/{ben}/partner-hunt/blocks", {"user_id": cat})[0] == 500


def test_malformed_user_ids_are_refused_not_redirected():
    status, body = _request(_app(RecordingGate()), "PUT", "/api/users/..%2F..%2Fetc/partner-hunt/preferences", prefs())
    assert status in (400, 404)
    assert not (config.USERS_DIR / "_anonymous").exists()

"""Partner Hunt use cases: status, preferences, matches, blocking.

Access to the board, checked in this order, each with its own error code so the client can say
exactly what stands in the way:

    user_not_found        no profile
    age_restricted        under MIN_AGE, or age not established
    xp_unavailable        the Run Module's XP gate could not be consulted  (not the user's to fix)
    xp_locked             the gate says no: not enough XP yet             (the user's to fix)
    preferences_required  no preferences, or not visible — you browse only if others can see you
"""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import date, datetime, timezone

from backend.partners import store
from backend.partners.matching import Person, Preferences, age_on, is_age_eligible, normalise_gender, rank
from backend.partners.policy import PARTNER_HUNT_MIN_XP
from backend.partners.xp_gate import XPGate, XPServiceUnavailable
from backend.users.store import read_profile, read_skill

log = logging.getLogger(__name__)


class PartnerHuntError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra

    def detail(self) -> dict:
        return {"code": self.code, "message": self.message, **self.extra}


def partner_status(user_id: str, gate: XPGate, *, today: date | None = None) -> dict:
    """Everything the client needs to decide what to show, in one read. Never raises for a closed
    gate — being locked is a state to display, not an error."""
    person = _require_person(user_id, today)
    xp, unlocked = _xp_snapshot(user_id, gate)
    preferences = store.read_preferences(user_id)
    age_ok = is_age_eligible(person)
    return {
        "min_xp": PARTNER_HUNT_MIN_XP,
        "xp": xp,
        "unlocked": unlocked,
        "age_eligible": age_ok,
        "fitness_level": person.fitness_level,
        "preferences": preferences,
        "ready": bool(unlocked and age_ok and preferences and preferences.get("visible")),
    }


def save_preferences(user_id: str, preferences: dict, *, today: date | None = None) -> dict:
    """Preferences may be saved while still locked, so a user can set up in advance and appear on
    boards the moment they clear the gate."""
    person = _require_person(user_id, today)
    if not is_age_eligible(person):
        raise _age_error()
    return store.write_preferences(user_id, preferences)


def find_matches(user_id: str, gate: XPGate, *, today: date | None = None) -> list[dict]:
    viewer = _require_person(user_id, today)
    if not is_age_eligible(viewer):
        raise _age_error()
    try:
        unlocked = gate.meets_xp_gate(user_id, PARTNER_HUNT_MIN_XP)
    except XPServiceUnavailable as exc:
        raise _xp_unavailable_error() from exc
    if not unlocked:
        xp, _ = _xp_snapshot(user_id, gate)
        raise PartnerHuntError(
            403, "xp_locked",
            f"Partner Hunt opens at {PARTNER_HUNT_MIN_XP} XP.",
            min_xp=PARTNER_HUNT_MIN_XP, xp=xp["xp"],
        )
    if viewer.preferences is None or not viewer.preferences.visible:
        raise PartnerHuntError(
            409, "preferences_required",
            "Set your Partner Hunt preferences and make yourself visible to browse. "
            "You can only see people who can see you.",
        )

    try:
        viewer = _with_blocks(viewer)
    except store.BlockListUnreadable as exc:
        # Showing the board without the viewer's own blocks would re-surface people they blocked.
        raise PartnerHuntError(
            500, "blocks_unreadable", "Your block list could not be read, so the board is withheld.",
        ) from exc

    people = []
    for candidate_id in store.list_user_ids():
        if candidate_id == user_id:
            continue
        candidate = _load_person(candidate_id, today)
        if candidate is None:
            continue
        try:
            people.append(_with_blocks(candidate))
        except store.BlockListUnreadable:
            # We cannot tell whether this person blocked the viewer, so they are left out.
            log.warning("skipping %s in Partner Hunt: unreadable block list", candidate_id)

    return [match.to_dict() for match in rank(viewer, people, _cached_gate(gate))]


def block_user(user_id: str, blocked_user_id: str) -> None:
    if blocked_user_id == user_id:
        raise PartnerHuntError(400, "invalid_block", "You cannot block yourself.")
    _require_person(user_id, None)
    if read_profile(blocked_user_id) is None:
        raise PartnerHuntError(404, "user_not_found", "That user does not exist.")
    try:
        store.add_block(user_id, blocked_user_id)
    except store.BlockListUnreadable as exc:
        raise PartnerHuntError(
            500, "blocks_unreadable", "Your block list could not be read, so it was not changed.",
        ) from exc


# --- helpers ----------------------------------------------------------------------------------------

def _cached_gate(gate: XPGate):
    """One gate call per candidate per request, failing closed: a candidate whose XP cannot be
    confirmed is not shown."""
    answers: dict[str, bool] = {}

    def passes(candidate_id: str) -> bool:
        if candidate_id not in answers:
            try:
                answers[candidate_id] = gate.meets_xp_gate(candidate_id, PARTNER_HUNT_MIN_XP)
            except XPServiceUnavailable:
                answers[candidate_id] = False
        return answers[candidate_id]

    return passes


def _xp_snapshot(user_id: str, gate: XPGate) -> tuple[dict, bool]:
    try:
        status = gate.get_user_xp(user_id)
        unlocked = gate.meets_xp_gate(user_id, PARTNER_HUNT_MIN_XP)
    except XPServiceUnavailable:
        return {"available": False, "xp": None, "updated_at": None}, False
    return {"available": True, "xp": status.xp, "updated_at": status.updated_at}, unlocked


def _require_person(user_id: str, today: date | None) -> Person:
    person = _load_person(user_id, today)
    if person is None:
        raise PartnerHuntError(404, "user_not_found", "User not found.")
    return person


def _load_person(user_id: str, today: date | None) -> Person | None:
    profile = read_profile(user_id)
    if profile is None:
        return None
    raw_preferences = store.read_preferences(user_id)
    try:
        preferences = Preferences.from_dict(raw_preferences) if raw_preferences else None
    except (KeyError, TypeError, ValueError):
        log.warning("malformed Partner Hunt preferences for %s; treating as not set", user_id)
        preferences = None
    level, _ = read_skill(user_id)
    return Person(
        user_id=user_id,
        first_name=str(profile.get("first_name", "")),
        last_name=str(profile.get("last_name", "")),
        gender=normalise_gender(profile.get("gender")),
        age=age_on(profile.get("date_of_birth"), today or datetime.now(timezone.utc).date()),
        fitness_level=level,
        preferences=preferences,
    )


def _with_blocks(person: Person) -> Person:
    return replace(person, blocked_ids=store.read_blocks(person.user_id))


def _age_error() -> PartnerHuntError:
    return PartnerHuntError(
        403, "age_restricted",
        "Partner Hunt is for members aged 18 and over, with a date of birth on their profile.",
    )


def _xp_unavailable_error() -> PartnerHuntError:
    return PartnerHuntError(
        503, "xp_unavailable",
        "Your XP could not be checked right now. This is not something you need to fix — try again later.",
    )

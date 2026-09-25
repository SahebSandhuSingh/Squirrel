"""Activity-matching use cases: a member's status, their matches, and blocking."""

from __future__ import annotations

import logging
from datetime import date

from backend.activity_matching import scoring
from backend.activity_matching.features import MatchingProfile, matching_profile, read_blocks
from backend.partners import store as blocks_store
from backend.partners.matching import age_band, display_name
from backend.partners.store import BlockListUnreadable
from backend.profiles.vocab import WORKOUT_TIMES
from backend.users.store import read_profile

log = logging.getLogger(__name__)


class ActivityMatchingError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message

    def detail(self) -> dict:
        return {"code": self.code, "message": self.message}


def _member(user_id: str, today: date | None) -> MatchingProfile:
    member = matching_profile(user_id, today=today)
    if member is None:
        raise ActivityMatchingError(404, "user_not_found", "No such user.")
    return member


def status(user_id: str, *, today: date | None = None) -> dict:
    """What stands between the member and their matches, and exactly what others would see."""
    member = _member(user_id, today)
    missing = []
    if not scoring.is_adult(member):
        missing.append("age")
    if not member.consents_readable:
        missing.append("consents_unreadable")
    elif not member.opted_in:
        missing.append("matching_consent")
    if not member.interests:
        missing.append("activities")
    return {
        "opted_in": member.opted_in,
        "age_eligible": scoring.is_adult(member),
        "activities": [
            {"activity": code, "label": scoring.LABELS[code], "interest": interest}
            for code, interest in sorted(member.interests.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "ready": not missing,
        "missing": missing,
        # Shown to the member so they can see what matching shares about them.
        "shared_with_matches": {
            "display_name": display_name(member.first_name, member.last_name),
            "age_band": age_band(member.age) if scoring.is_adult(member) else None,
            "fitness_level": member.fitness_level,
            "activities": [scoring.LABELS[c] for c in sorted(member.interests, key=scoring.CATALOGUE_ORDER.get)],
            "workout_times": sorted(member.workout_times, key=_time_order) if member.workout_times else None,
        },
    }


def find_matches(user_id: str, *, today: date | None = None) -> list[dict]:
    """Ranked suggestions. You only see others while others can see you (opted in, with activities)."""
    viewer = _member(user_id, today)
    if not scoring.is_adult(viewer):
        raise ActivityMatchingError(403, "age_restricted", "Activity matching is for members aged 18 and over.")
    if not viewer.consents_readable:
        raise ActivityMatchingError(503, "consents_unreadable",
                                    "Your consent settings can't be read right now, so matching is paused.")
    if not viewer.opted_in:
        raise ActivityMatchingError(403, "matching_consent_required",
                                    "Turn on activity matching to see members who share your activities.")
    if not viewer.interests:
        raise ActivityMatchingError(409, "activities_required",
                                    "Add at least one activity so we can find people who share it.")
    try:
        viewer_blocks = read_blocks(user_id)
    except BlockListUnreadable as exc:
        raise ActivityMatchingError(500, "blocks_unreadable",
                                    "Your block list couldn't be read, so no matches were shown.") from exc

    candidates: list[tuple[MatchingProfile, frozenset[str]]] = []
    for other_id in blocks_store.list_user_ids():
        if other_id == user_id:
            continue
        other = matching_profile(other_id, today=today)
        if other is None or not other.opted_in:
            continue
        try:
            other_blocks = read_blocks(other_id)
        except BlockListUnreadable:
            # Can't confirm they haven't blocked the viewer: leave them out.
            log.warning("block list unreadable for %s; excluded from activity matches", other_id)
            continue
        candidates.append((other, other_blocks))
    return [m.to_dict() for m in scoring.rank(viewer, candidates, viewer_blocks)]


def block(user_id: str, blocked_user_id: str) -> None:
    """Block someone from every people-matching feature (the list is shared with Partner Hunt)."""
    if blocked_user_id == user_id:
        raise ActivityMatchingError(400, "invalid_block", "You cannot block yourself.")
    if read_profile(user_id) is None:
        raise ActivityMatchingError(404, "user_not_found", "No such user.")
    if read_profile(blocked_user_id) is None:
        raise ActivityMatchingError(404, "user_not_found", "That user does not exist.")
    try:
        blocks_store.add_block(user_id, blocked_user_id)
    except BlockListUnreadable as exc:
        raise ActivityMatchingError(500, "blocks_unreadable",
                                    "Your block list couldn't be read, so it wasn't changed.") from exc


def _time_order(time: str) -> int:
    return WORKOUT_TIMES.index(time) if time in WORKOUT_TIMES else len(WORKOUT_TIMES)

"""The shared-workout session document and its rules. Pure: no I/O, and the time is always passed in.

A session is one JSON document (stored as is; see store.py):

    {session_id, invite_code, exercise_key, duration_s, created_at, starts_at, ends_at,
     players: [{user_id, role, person, ready, reps, seq, joined_at, finished_at, left_at, left_reason}]}

`user_id` is the login `sub` and never leaves this service; `person` is the Social PersonLite
(profile id, name, avatar, hostel) looked up when the player joined, and is what the app sees.

The phase is never stored. It is worked out from the timestamps on every read, in this order:

    not started (starts_at is null)
        every player has left               → finished   (the lobby closed)
        created LOBBY_TTL_S ago or more     → expired
        otherwise                           → lobby
    started
        ends_at passed, or every player has finished or left
                                            → finished
        before starts_at                    → countdown
        otherwise                           → racing

Before the start, leaving frees the leaver's seat (they are removed; if the host leaves, the
partner becomes the host and can invite someone else). The last player to leave keeps their seat
with left_at set, which is what closes the lobby. From the countdown on, each player's race ends
on its own: their finished_at or left_at is set and the other keeps going.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.shared_workouts.policy import COUNTDOWN_S, EXERCISES, LOBBY_TTL_S, REP_SOURCE, REPS_GRACE_S

LOBBY, EXPIRED, COUNTDOWN, RACING, FINISHED = "lobby", "expired", "countdown", "racing", "finished"
IN_PLAY = (LOBBY, COUNTDOWN, RACING)


# --- time ------------------------------------------------------------------------------------------

def iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


# --- building --------------------------------------------------------------------------------------

def new_session(session_id: str, invite_code: str, exercise_key: str, duration_s: int,
                host_id: str, host_person: dict, now: datetime) -> dict:
    return {
        "session_id": session_id,
        "invite_code": invite_code,
        "exercise_key": exercise_key,
        "duration_s": duration_s,
        "created_at": iso(now),
        "starts_at": None,
        "ends_at": None,
        "players": [new_player(host_id, "host", host_person, now)],
    }


def new_player(user_id: str, role: str, person: dict, now: datetime) -> dict:
    return {
        "user_id": user_id, "role": role, "person": person, "ready": False, "reps": 0, "seq": 0,
        "joined_at": iso(now), "finished_at": None, "left_at": None, "left_reason": None,
    }


# --- reading ---------------------------------------------------------------------------------------

def player(session: dict, user_id: str) -> dict | None:
    return next((p for p in session["players"] if p["user_id"] == user_id), None)


def seated(session: dict) -> list[dict]:
    """Players who have not left."""
    return [p for p in session["players"] if p["left_at"] is None]


def expires_at(session: dict) -> datetime:
    return parse(session["created_at"]) + timedelta(seconds=LOBBY_TTL_S)


def phase(session: dict, now: datetime) -> str:
    starts_at = parse(session["starts_at"])
    players = session["players"]
    if starts_at is None:
        if all(p["left_at"] is not None for p in players):
            return FINISHED
        return EXPIRED if now >= expires_at(session) else LOBBY
    if now >= parse(session["ends_at"]) or all(p["finished_at"] or p["left_at"] for p in players):
        return FINISHED
    return COUNTDOWN if now < starts_at else RACING


def closes_at(session: dict) -> datetime:
    """The latest moment the session can still be in play (and take late rep reports). Stored next
    to the document so "is this person already in a session" is one indexed query."""
    if session["ends_at"] is not None:
        return parse(session["ends_at"]) + timedelta(seconds=REPS_GRACE_S)
    return expires_at(session)


def member_ids(session: dict) -> list[str]:
    return [p["user_id"] for p in seated(session)]


def in_play_for(session: dict, user_id: str, now: datetime) -> bool:
    """Whether `user_id` holds a seat in a session that is still lobby, countdown or racing."""
    me = player(session, user_id)
    return bool(me and me["left_at"] is None and me["finished_at"] is None and phase(session, now) in IN_PLAY)


def can_report(session: dict, me: dict, now: datetime) -> bool:
    """Rep reports and Finish: from the start until REPS_GRACE_S after the end, while the player's
    own race is still going (a player whose time simply ran out may still send their last taps)."""
    starts_at = parse(session["starts_at"])
    if starts_at is None or now < starts_at or me["left_at"] is not None:
        return False
    if now >= parse(session["ends_at"]) + timedelta(seconds=REPS_GRACE_S):
        return False
    return me["finished_at"] is None


# --- changing --------------------------------------------------------------------------------------

def set_ready(session: dict, me: dict, ready: bool, now: datetime) -> None:
    me["ready"] = ready
    players = seated(session)
    if len(players) == 2 and all(p["ready"] for p in players):
        starts_at = now + timedelta(seconds=COUNTDOWN_S)
        session["starts_at"] = iso(starts_at)
        session["ends_at"] = iso(starts_at + timedelta(seconds=session["duration_s"]))


def report(me: dict, reps: int, seq: int) -> bool:
    """Highest seq wins: a retry or a report overtaken by a later one changes nothing."""
    if seq <= me["seq"]:
        return False
    me["reps"], me["seq"] = reps, seq
    return True


def leave(session: dict, me: dict, now: datetime, reason: str = "left") -> None:
    if session["starts_at"] is None:
        others = [p for p in seated(session) if p is not me]
        if others:
            # Free the seat. Whoever stays starts over: they host (and hold the invite), and must
            # ready up again with whoever joins next.
            session["players"] = [p for p in session["players"] if p is not me]
            for p in others:
                p["role"], p["ready"] = "host", False
            return
    me["left_at"], me["left_reason"] = iso(now), reason


def join(session: dict, user_id: str, person: dict, now: datetime) -> None:
    for p in seated(session):
        p["ready"] = False  # a new partner: everyone readies up again
    session["players"].append(new_player(user_id, "partner", person, now))


# --- the app's view --------------------------------------------------------------------------------

def view(session: dict, viewer: str | None, now: datetime, *, connected: dict[str, bool],
         invite_url: str) -> dict:
    """The session as the app sees it. Login subjects never appear: people are Social PersonLites."""
    ends_at = parse(session["ends_at"])
    time_up = ends_at is not None and now >= ends_at
    seats = {"host": None, "partner": None}
    for p in session["players"]:
        finished_at = p["finished_at"]
        if finished_at is None and p["left_at"] is None and time_up:
            finished_at = session["ends_at"]
        seats[p["role"]] = {
            "user": p["person"],
            "role": p["role"],
            "ready": p["ready"],
            "connected": bool(connected.get(p["user_id"])) and p["left_at"] is None,
            "reps": p["reps"],
            "seq": p["seq"],
            "finished_at": finished_at,
            "left_at": p["left_at"],
            "left_reason": p["left_reason"],
        }
    me = player(session, viewer) if viewer else None
    return {
        "session_id": session["session_id"],
        "invite_code": session["invite_code"],
        "invite_url": invite_url,
        "exercise": {"key": session["exercise_key"], "name": EXERCISES[session["exercise_key"]]},
        "duration_s": session["duration_s"],
        "phase": phase(session, now),
        "you": me["role"] if me else None,
        "host": seats["host"],
        "partner": seats["partner"],
        "created_at": session["created_at"],
        "expires_at": iso(expires_at(session)),
        "starts_at": session["starts_at"],
        "ends_at": session["ends_at"],
        "rep_source": REP_SOURCE,
        "server_time": iso(now),
    }

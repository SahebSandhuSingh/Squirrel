"""Shared workout use cases. Every error carries a machine-readable code (SharedWorkoutError.detail)
so the app can say exactly what happened.

Who may see what:
    a session (GET, socket)   only the people in it; anyone else gets 404, so its existence isn't revealed
    an invite (preview, join) anyone signed in with the code, unless either of you has blocked the
                              other (404, the same as an unknown code); blocks are Social's and the
                              check fails closed (503 blocks_unreachable)
    ready (with a partner)    blocks checked again: a blocked pair's lobby closes for both, quietly;
                              503 blocks_unreachable when Social can't be asked. Never during a race.

People are shown by their Social PersonLite, looked up when they create or join (503
social_unreachable when Social can't answer), and stored with the session, so an outage during a
race doesn't blank anyone's name. Nothing here writes XP or an activity: reps are hand-tapped.
"""

from __future__ import annotations

import logging
import re
import secrets
import uuid
from datetime import datetime, timezone

from backend import config, social_blocks, social_people
from backend.shared_workouts import hub, model, presence, store
from backend.shared_workouts.policy import EXERCISES, INVITE_ALPHABET, INVITE_LENGTH

log = logging.getLogger(__name__)

_SESSION_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_CODE_RE = re.compile(rf"^[{INVITE_ALPHABET}]{{{INVITE_LENGTH}}}$")


def utcnow() -> datetime:
    """The clock. Tests replace it."""
    return datetime.now(timezone.utc)


class SharedWorkoutError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra

    def detail(self) -> dict:
        return {"code": self.code, "message": self.message, **self.extra}


# --- the eight routes ------------------------------------------------------------------------------

def create(user_id: str, exercise_key: str, duration_s: int) -> dict:
    now = utcnow()
    if exercise_key not in EXERCISES:
        raise SharedWorkoutError(422, "invalid_exercise", "Shared workouts are rep races: pick a rep exercise.")
    _ensure_free(user_id, now, except_session=None)
    person = _resolve(user_id)
    for _ in range(5):
        doc = model.new_session(uuid.uuid4().hex, _new_code(), exercise_key, duration_s, user_id, person, now)
        try:
            store.insert(doc)
            break
        except store.DuplicateInviteCode:
            continue
    else:
        raise RuntimeError("could not draw an unused invite code")
    try:
        store.prune(now)
    except Exception:  # noqa: BLE001 — housekeeping must never fail a create
        log.exception("could not prune closed shared workouts")
    presence.touch(doc["session_id"], user_id, now)
    return render(doc, user_id, now)


def get(session_id: str, user_id: str) -> dict:
    now = utcnow()
    doc = _participant_session(session_id, user_id, now)
    return render(doc, user_id, now)


def preview(code: str, user_id: str) -> dict:
    now = utcnow()
    session_id = _session_for_code(code)
    doc = _read(session_id)
    if model.player(doc, user_id) is not None:
        presence.touch(session_id, user_id, now)
        doc = _swept(doc, now)
    else:
        _refuse_if_blocked(user_id, doc, _blocked(user_id))
    return render(doc, user_id, now)


def join(code: str, user_id: str) -> dict:
    now = utcnow()
    session_id = _session_for_code(code)
    doc = _read(session_id)
    if model.player(doc, user_id) is not None:
        presence.touch(session_id, user_id, now)
        return render(_swept(doc, now), user_id, now)
    _check_joinable(doc, now)
    blocked = _blocked(user_id)
    _refuse_if_blocked(user_id, doc, blocked)
    _ensure_free(user_id, now, except_session=session_id)
    person = _resolve(user_id)

    def change(d: dict) -> None:
        if model.player(d, user_id) is not None:
            return
        _check_joinable(d, now)                 # again, under the lock: the seat may have gone
        _refuse_if_blocked(user_id, d, blocked)  # …or someone else may hold the other seat now
        model.join(d, user_id, person, now)

    doc = _update(session_id, change, now)
    presence.touch(session_id, user_id, now)
    publish_session(doc, now)
    return render(doc, user_id, now)


def set_ready(session_id: str, user_id: str, ready: bool) -> dict:
    now = utcnow()
    doc = _participant_session(session_id, user_id, now)
    # Readying up with a partner seated is the last step before the race, so blocks are checked
    # again here (either may have blocked the other since joining). Fails closed: no race starts
    # while Social can't be asked.
    others = [p for p in model.seated(doc) if p["user_id"] != user_id]
    blocked = _blocked(user_id) if ready and others and model.phase(doc, now) == model.LOBBY else None

    def change(d: dict) -> None:
        me = _me(d, user_id)
        current = model.phase(d, now)
        if d["starts_at"] is not None:
            raise SharedWorkoutError(409, "already_started", "The countdown has started; ready can't change now.")
        if current != model.LOBBY:
            raise SharedWorkoutError(409, "not_in_lobby", "This session has ended.", phase=current)
        if blocked and any(p["user_id"] in blocked for p in model.seated(d) if p is not me):
            model.close_lobby(d, now)          # quietly: the same for both, no error, no reason given
            return
        model.set_ready(d, me, ready, now)

    doc = _update(session_id, change, now)
    publish_session(doc, now)
    return render(doc, user_id, now)


def report_reps(session_id: str, user_id: str, reps: int, seq: int) -> dict:
    now = utcnow()
    _participant_session(session_id, user_id, now)

    def change(d: dict) -> bool:
        me = _me(d, user_id)
        if not model.can_report(d, me, now):
            raise _not_racing(d, now)
        return model.report(me, reps, seq)

    doc, accepted = _update_with_result(session_id, change, now)
    me = model.player(doc, user_id)
    if accepted:
        _publish_reps(doc, me, now)
    return {"accepted": accepted, "reps": me["reps"], "seq": me["seq"]}


def complete(session_id: str, user_id: str, reps: int, seq: int) -> dict:
    now = utcnow()
    _participant_session(session_id, user_id, now)

    def change(d: dict) -> bool:
        me = _me(d, user_id)
        if me["finished_at"] is not None:
            return False                       # already finished: nothing changes
        if not model.can_report(d, me, now):
            raise _not_racing(d, now)
        accepted = model.report(me, reps, seq)
        me["finished_at"] = model.iso(min(now, model.parse(d["ends_at"])))
        return accepted

    doc, accepted = _update_with_result(session_id, change, now)
    if accepted:
        _publish_reps(doc, model.player(doc, user_id), now)
    publish_session(doc, now)
    return render(doc, user_id, now)


def leave(session_id: str, user_id: str) -> dict:
    now = utcnow()
    _participant_session(session_id, user_id, now)

    def change(d: dict) -> None:
        me = _me(d, user_id)
        if model.phase(d, now) in (model.EXPIRED, model.FINISHED) or me["left_at"] or me["finished_at"]:
            return                             # nothing left to leave
        model.leave(d, me, now)

    doc = _update(session_id, change, now)
    publish_session(doc, now)
    return render(doc, user_id, now)


# --- the socket ------------------------------------------------------------------------------------

def socket_open(session_id: str, user_id: str) -> tuple[list[dict], bool]:
    """For a socket being opened: the first message, and whether the session is already over (send
    it, then close). Raises SharedWorkoutError(404) for anyone not in the session."""
    now = utcnow()
    doc = _participant_session(session_id, user_id, now)
    return [session_message(doc, user_id, now)], _closed(doc, now)


def ping(session_id: str, user_id: str) -> dict:
    now = utcnow()
    presence.touch(session_id, user_id, now)
    return {"type": "pong", "data": {"server_time": model.iso(now)}}


def tick(session_id: str, previous: tuple | None) -> tuple | None:
    """One sweep of a session that has sockets open: end the race of anyone gone, and push the
    session when anything visible changed since `previous` (a phase reached by the clock alone,
    someone's connection). Returns the new signature, or None when the session is gone."""
    now = utcnow()
    try:
        doc = _read(session_id)
    except SharedWorkoutError:
        return None
    doc = _swept(doc, now, publish=False)
    signature = _signature(doc, now)
    if signature != previous:
        publish_session(doc, now)
    return signature


# --- rendering and publishing ----------------------------------------------------------------------

def invite_url(code: str) -> str:
    return f"{config.PUBLIC_BASE_URL}/w/{code}"


def render(doc: dict, viewer: str, now: datetime) -> dict:
    sid = doc["session_id"]
    connected = {p["user_id"]: presence.connected(sid, p["user_id"], now) for p in doc["players"]}
    return model.view(doc, viewer, now, connected=connected, invite_url=invite_url(doc["invite_code"]))


def session_message(doc: dict, viewer: str, now: datetime) -> dict:
    return {"type": "workout.session.updated", "data": render(doc, viewer, now)}


def publish_session(doc: dict, now: datetime) -> None:
    """Push the session to everyone listening. A listener who is no longer in it (they left the
    lobby), or any listener once the session is over, gets the update and then the socket closes."""
    closed = _closed(doc, now)

    def build(listener_id: str) -> list[dict]:
        messages = [session_message(doc, listener_id, now)]
        if closed or model.player(doc, listener_id) is None:
            messages.append({hub.CLOSE: 1000})
        return messages

    hub.publish(doc["session_id"], build)
    if closed:
        presence.forget(doc["session_id"])


def _publish_reps(doc: dict, me: dict, now: datetime) -> None:
    message = {"type": "workout.reps.updated", "data": {
        "session_id": doc["session_id"], "user_id": me["person"]["user_id"],
        "reps": me["reps"], "seq": me["seq"], "at": model.iso(now)}}
    hub.publish(doc["session_id"], lambda _listener: [message])


def _closed(doc: dict, now: datetime) -> bool:
    return model.phase(doc, now) in (model.EXPIRED, model.FINISHED)


def _signature(doc: dict, now: datetime) -> tuple:
    view = render(doc, doc["players"][0]["user_id"], now)
    seats = tuple((s["ready"], s["connected"], s["finished_at"], s["left_at"])
                  for s in (view["host"], view["partner"]) if s)
    return view["phase"], seats


# --- helpers ---------------------------------------------------------------------------------------

def _read(session_id: str) -> dict:
    doc = store.read(session_id) if _SESSION_ID_RE.fullmatch(session_id or "") else None
    if doc is None:
        raise _not_found()
    return doc


def _participant_session(session_id: str, user_id: str, now: datetime) -> dict:
    """The session, for someone in it (404 for anyone else), with their presence noted and anyone
    gone swept out."""
    doc = _read(session_id)
    if model.player(doc, user_id) is None:
        raise _not_found()
    presence.touch(session_id, user_id, now)
    return _swept(doc, now)


def _swept(doc: dict, now: datetime, *, publish: bool = True) -> dict:
    """End the race of every player gone for DISCONNECT_AFTER_S during the countdown or the race."""
    if not _gone_players(doc, now):
        return doc
    out = store.update(doc["session_id"], lambda d: _sweep(d, now))
    if out is None:
        raise _not_found()
    doc = out[0]
    if publish:
        publish_session(doc, now)
    return doc


def _gone_players(doc: dict, now: datetime) -> list[dict]:
    if model.phase(doc, now) not in (model.COUNTDOWN, model.RACING):
        return []
    return [p for p in doc["players"]
            if p["left_at"] is None and p["finished_at"] is None and presence.gone(doc["session_id"], p["user_id"], now)]


def _sweep(doc: dict, now: datetime) -> None:
    for p in _gone_players(doc, now):
        model.leave(doc, p, now, reason="disconnected")


def _update_with_result(session_id: str, change, now: datetime) -> tuple[dict, object]:
    def apply(d: dict):
        _sweep(d, now)
        return change(d)

    out = store.update(session_id, apply)
    if out is None:
        raise _not_found()
    return out


def _update(session_id: str, change, now: datetime) -> dict:
    return _update_with_result(session_id, change, now)[0]


def _me(doc: dict, user_id: str) -> dict:
    me = model.player(doc, user_id)
    if me is None:
        raise _not_found()
    return me


def _check_joinable(doc: dict, now: datetime) -> None:
    current = model.phase(doc, now)
    if current != model.LOBBY:
        raise SharedWorkoutError(409, "not_joinable", "This session can't be joined any more.", phase=current)
    if len(model.seated(doc)) >= 2:
        raise SharedWorkoutError(409, "session_full", "This session already has two people.")


def _ensure_free(user_id: str, now: datetime, *, except_session: str | None) -> None:
    for doc in store.open_for(user_id, now):
        if doc["session_id"] == except_session:
            continue
        doc = _swept(doc, now)
        if model.in_play_for(doc, user_id, now):
            raise SharedWorkoutError(409, "already_in_session", "You're already in a shared workout.",
                                     session_id=doc["session_id"])


def _blocked(user_id: str) -> frozenset[str]:
    try:
        return social_blocks.blocked_either_way(user_id)
    except social_blocks.BlocksUnreachable as exc:
        raise SharedWorkoutError(
            503, "blocks_unreachable",
            "Blocked members couldn't be checked right now, so the invite can't be opened. Try again in a moment.",
        ) from exc


def _refuse_if_blocked(user_id: str, doc: dict, blocked: frozenset[str]) -> None:
    # The same answer as an unknown code: a block is never revealed.
    if any(p["user_id"] in blocked for p in doc["players"] if p["user_id"] != user_id):
        raise _not_found()


def _resolve(user_id: str) -> dict:
    try:
        return social_people.resolve([user_id])[user_id]
    except social_people.SocialUnreachable as exc:
        raise SharedWorkoutError(
            503, "social_unreachable",
            "Your profile couldn't be loaded right now. Try again in a moment.",
        ) from exc


def _session_for_code(code: str) -> str:
    code = (code or "").strip().upper()
    session_id = store.session_id_for_code(code) if _CODE_RE.fullmatch(code) else None
    if session_id is None:
        raise _not_found()
    return session_id


def _new_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(INVITE_LENGTH))


def _not_racing(doc: dict, now: datetime) -> SharedWorkoutError:
    return SharedWorkoutError(409, "not_racing", "Your race isn't running.", phase=model.phase(doc, now))


def _not_found() -> SharedWorkoutError:
    return SharedWorkoutError(404, "not_found", "Shared workout not found.")

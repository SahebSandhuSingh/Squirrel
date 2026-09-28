"""Response shapes for challenges (kept in one place so docs, frontend and tests agree)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Challenge, ChallengeParticipant, User
from app.services.challenges import eligibility_error, is_open_for, status_for
from app.timeutil import as_utc, day_bounds_utc


def _iso(dt: datetime | None) -> str | None:
    return as_utc(dt).isoformat().replace("+00:00", "Z") if dt else None


def progress_block(c: Challenge, p: ChallengeParticipant | None) -> dict:
    current = p.progress if p else 0.0
    target = c.target
    return {
        "current": round(current, 4),
        "target": target,
        "progress": round(min(1.0, current / target), 4) if target else None,
        "completed": bool(p and p.status in ("completed", "won")),
        "status": p.status if p else None,
    }


def challenge_views(session: Session, user: User, challenges: list[Challenge], now: datetime) -> list[dict]:
    if not challenges:
        return []
    ids = [c.id for c in challenges]
    mine = {p.challenge_id: p for p in session.scalars(select(ChallengeParticipant).where(ChallengeParticipant.challenge_id.in_(ids), ChallengeParticipant.user_id == user.id)).all()}
    live = ChallengeParticipant.status.notin_(("left", "cancelled", "invited"))
    counts = dict(session.execute(select(ChallengeParticipant.challenge_id, func.count()).where(ChallengeParticipant.challenge_id.in_(ids), live).group_by(ChallengeParticipant.challenge_id)).all())
    totals = dict(session.execute(select(ChallengeParticipant.challenge_id, func.sum(ChallengeParticipant.contribution)).where(ChallengeParticipant.challenge_id.in_(ids), ChallengeParticipant.status.notin_(("left", "cancelled"))).group_by(ChallengeParticipant.challenge_id)).all())
    h2h_ids = [c.id for c in challenges if c.kind == "head_to_head"]
    opponents: dict[str, tuple[ChallengeParticipant, User]] = {}
    if h2h_ids:
        for p, u in session.execute(select(ChallengeParticipant, User).join(User, User.id == ChallengeParticipant.user_id).where(ChallengeParticipant.challenge_id.in_(h2h_ids), ChallengeParticipant.user_id != user.id)).all():
            opponents[p.challenge_id] = (p, u)

    out = []
    for c in challenges:
        p = mine.get(c.id)
        if c.window == "local_day":
            starts, ends = day_bounds_utc(c.local_date, user.timezone)
        else:
            starts, ends = as_utc(c.starts_at), as_utc(c.ends_at)
        open_, why = is_open_for(c, user, now)
        ineligible = None
        if c.kind == "head_to_head":
            can_join = open_ and p is not None and p.status == "invited"
        else:
            can_join = open_ and (p is None or p.status == "left") and not (c.kind == "group" and c.status == "completed")
            if can_join:
                err = eligibility_error(session, c, user)
                if err:
                    can_join, ineligible = False, {"code": err.code, "detail": err.detail}
        v = {
            "id": c.id,
            "kind": c.kind,
            "title": c.title,
            "description": c.description,
            "icon": c.icon,
            "metric": c.metric,
            "unit": c.unit,
            "target": c.target,
            "xpReward": c.xp_reward,
            "startsAt": _iso(starts),
            "endsAt": _iso(ends),
            "endsInMinutes": max(0, int((ends - now).total_seconds() // 60)),
            "status": status_for(c, user, now),
            "participants": int(counts.get(c.id, 0)),
            "maxParticipants": c.max_participants,
            "rules": c.rules or {},
            "joined": bool(p and p.status not in ("left", "invited", "cancelled")),
            "canJoin": bool(can_join),
            "closedReason": None if open_ else why,
            "ineligible": ineligible,
            "me": progress_block(c, p),
        }
        if c.kind == "group":
            v["group"] = {"name": c.group_name, "collective": round(float(totals.get(c.id) or 0), 4), "members": int(counts.get(c.id, 0)), "completedAt": _iso(c.completed_at)}
        if c.kind == "head_to_head":
            op = opponents.get(c.id)
            v["xpRewardTie"] = c.xp_reward_tie
            v["opponent"] = {"userId": op[1].id, "name": op[1].display_name, "avatar": op[1].avatar_url, "score": round(op[0].progress, 4), "status": op[0].status} if op else None
            v["winnerUserId"] = c.winner_user_id
            v["invited"] = bool(p and p.status == "invited")
        out.append(v)
    return out

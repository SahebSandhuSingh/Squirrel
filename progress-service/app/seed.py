"""Development seed data. Everything goes through the real engine (activities.record, challenge
join/resolve), so XP transactions, daily rows, streaks and challenge progress are consistent.

    python -m app.seed --reset      # wipe + reseed (refused when APP_ENV=production)

Users are the app's demo people (mobile/src/data/users.ts), all on Ganeshkhind Campus, Pune.
"""

from __future__ import annotations

import argparse
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.config import settings
from app.db import SessionLocal
from app.models import ActivityEvent, Challenge, ChallengeParticipant, DailyProgress, Follow, User, UserStats, XpTransaction
from app.rules import RUN_COMPLETED, STEP_COUNT, WORKOUT_COMPLETED
from app.services import activities, challenges
from app.services.activities import ActivityInput
from app.timeutil import day_bounds_utc, local_today, utcnow

TZ = "Asia/Kolkata"
CAMPUS = "Ganeshkhind Campus"
PEOPLE = [
    ("u_aanya", "Aanya S."), ("u_rhea", "Rhea K."), ("u_aarav", "Aarav M."), ("u_meera", "Meera J."), ("u_kabir", "Kabir R."),
    ("u_zoya", "Zoya F."), ("u_dev", "Dev P."), ("u_isha", "Isha T."), ("u_tara", "Tara V."), ("u_maya", "Maya L."),
]
#: (steps per day, workout minutes per day, run km per day) — deterministic, varied per person
PROFILE = {
    "u_aanya": (7800, 25, 3.2), "u_rhea": (9800, 35, 5.4), "u_aarav": (6100, 45, 0), "u_meera": (8800, 60, 2.1), "u_kabir": (5200, 20, 6.8),
    "u_zoya": (11200, 40, 4.0), "u_dev": (4300, 15, 2.5), "u_isha": (7300, 30, 0), "u_tara": (6600, 25, 1.8), "u_maya": (9100, 30, 3.5),
}


def reset(session) -> None:
    for model in (ChallengeParticipant, Challenge, XpTransaction, ActivityEvent, DailyProgress, Follow, UserStats, User):
        session.execute(delete(model))
    session.commit()


def at(day, hour: int, minute: int = 0) -> datetime:
    start, _ = day_bounds_utc(day, TZ)
    return start + timedelta(hours=hour, minutes=minute)


def seed() -> None:
    if settings.app_env == "production":
        raise SystemExit("refusing to seed a production database")
    now = utcnow()
    with SessionLocal() as s:
        reset(s)
        users = {}
        for uid, name in PEOPLE:
            u = User(id=uid, display_name=name, campus=CAMPUS, timezone=TZ)
            s.add(u)
            users[uid] = u
        s.flush()  # users before stats/follows (no ORM relationships to order the inserts)
        s.add_all([UserStats(user_id=uid) for uid in users])
        for other in ("u_rhea", "u_meera", "u_zoya", "u_isha"):
            s.add(Follow(follower_id="u_aanya", followee_id=other))
        s.commit()

        today = local_today(TZ, now)
        week_ago = now - timedelta(days=6)

        # Group + special challenges that started a week ago, so the seeded activity counts.
        groups = [
            Challenge(id="grp-runners-500", kind="group", title="Runners: 500 km this month", description="Every verified km on campus counts toward the crew total.",
                      metric="distance_km", target=500, unit="km", xp_reward=250, window="absolute", starts_at=week_ago - timedelta(hours=1),
                      ends_at=now + timedelta(days=20), status="active", group_name="Campus Runners", icon="account-group", rules={"campus": CAMPUS}),
            Challenge(id="grp-early-1000", kind="group", title="Early Birds: 1,000 active minutes", description="Workouts and runs, all week.",
                      metric="active_minutes", target=1000, unit="min", xp_reward=180, window="absolute", starts_at=week_ago - timedelta(hours=1),
                      ends_at=now + timedelta(days=2), status="active", group_name="Early Birds", icon="weather-sunset-up"),
            Challenge(id="spc-weekend-3", kind="special", title="Weekend Warrior: 3 workouts", description="Limited time. First 50 people only.",
                      metric="workouts", target=3, unit="workouts", xp_reward=120, window="absolute", starts_at=week_ago - timedelta(hours=1),
                      ends_at=now + timedelta(days=3), status="active", max_participants=50, icon="lightning-bolt", rules={"minLevel": 1}),
            Challenge(id="spc-night-10k", kind="special", title="Night Owl 10K", description="Run 10 km after dark this week. Level 5+.",
                      metric="distance_km", target=10, unit="km", xp_reward=200, window="absolute", starts_at=now - timedelta(days=1),
                      ends_at=now + timedelta(days=5), status="active", max_participants=100, icon="weather-night", rules={"minLevel": 5}),
        ]
        s.add_all(groups)
        s.commit()
        for c in groups[:2]:
            for uid in users:
                if c.id == "grp-early-1000" and uid in ("u_dev", "u_tara"):
                    continue
                challenges.join(s, users[uid], c.id, now=week_ago)
        for uid in ("u_aanya", "u_rhea", "u_meera", "u_aarav"):
            challenges.join(s, users[uid], "spc-weekend-3", now=week_ago)
        s.commit()

        # Head-to-head: an accepted 7-day duel (live), one already resolved, one pending invite.
        live = challenges.create_head_to_head(s, users["u_aanya"], "u_rhea", "steps", 7 * 24, now=week_ago)
        challenges.join(s, users["u_rhea"], live.id, now=week_ago)
        done = challenges.create_head_to_head(s, users["u_aanya"], "u_dev", "active_minutes", 24, now=now - timedelta(days=5, hours=3))
        challenges.join(s, users["u_dev"], done.id, now=now - timedelta(days=5, hours=2))
        challenges.create_head_to_head(s, users["u_kabir"], "u_aanya", "distance_km", 48, now=now - timedelta(hours=2))
        s.commit()

        # A week of activity (today only up to "now").
        for back in range(6, -1, -1):
            day = today - timedelta(days=back)
            challenges.ensure_daily(s, day)
            for i, uid in enumerate(users):
                steps, mins, km = PROFILE[uid]
                wobble = ((back * 7 + i * 3) % 5 - 2) / 10  # ±20%, deterministic
                events = [
                    ActivityInput(f"seed-steps-{uid}-{day}", STEP_COUNT, int(steps * (1 + wobble)), at(day, 21)),
                    ActivityInput(f"seed-workout-{uid}-{day}", WORKOUT_COMPLETED, max(5, round(mins * (1 + wobble))), at(day, 7, 30), {"exercise": "squat", "reps": 24}),
                ]
                if km and (back + i) % 2 == 0:
                    events.append(ActivityInput(f"seed-run-{uid}-{day}", RUN_COMPLETED, round(km * (1 + wobble), 2), at(day, 18), {"minutes": round(km * 6.2), "territoryM2": 40000 if (back + i) % 4 == 0 else 0, "runId": f"seed-{uid}-{day}"}))
                joined_at = at(day, 6)
                if joined_at <= now:  # join the day's daily challenges once, before any logging
                    for code in ("daily-move-30", "daily-steps-10k", "daily-run-5k"):
                        challenges.join(s, users[uid], f"{code}:{day.isoformat()}", now=joined_at)
                    s.commit()
                for ev in events:
                    if ev.occurred_at > now:
                        continue
                    activities.record(s, users[uid], ev, source="run_module" if ev.type == RUN_COMPLETED else "client", trusted=True, now=ev.occurred_at + timedelta(minutes=1))
                    s.commit()

        # The finished duel (and any other due challenge) resolves now.
        challenges.resolve_due(s, now=now)
        s.commit()
        print(f"seeded {len(users)} users, {s.query(Challenge).count()} challenges, {s.query(ActivityEvent).count()} activity events, {s.query(XpTransaction).count()} XP transactions")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="wipe and reseed (the only mode)")
    ap.parse_args()
    seed()

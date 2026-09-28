"""Game rules in one place: activity types, validation bounds, XP amounts, goals, streaks, templates.

XP amounts mirror the rules the app already shows (logic/xp.ts): runs 50 + 10/km + 25 for new
territory (150/day cap); exercise 30 + 2/rep or +1 per 10 s (100/session cap).
"""

from __future__ import annotations

# ---- activity types ----------------------------------------------------------------------------
STEP_COUNT = "STEP_COUNT"                  # value = cumulative steps for that local day (phone pedometer)
WORKOUT_COMPLETED = "WORKOUT_COMPLETED"    # value = minutes; metadata: exercise, reps?, calories?, sessionId?
RUN_COMPLETED = "RUN_COMPLETED"            # value = km; metadata: minutes, territoryM2, runId (trusted source only)
CHALLENGE_COMPLETED = "CHALLENGE_COMPLETED"    # system audit event
DAILY_GOAL_COMPLETED = "DAILY_GOAL_COMPLETED"  # system audit event

#: Types a phone may submit. Runs come only from the Run Module (verified GPS + anti-cheat).
CLIENT_TYPES = {STEP_COUNT, WORKOUT_COMPLETED}
#: Types trusted services may submit (X-Service-Key).
TRUSTED_TYPES = {STEP_COUNT, WORKOUT_COMPLETED, RUN_COMPLETED}
SYSTEM_TYPES = {CHALLENGE_COMPLETED, DAILY_GOAL_COMPLETED}

UNITS = {STEP_COUNT: "steps", WORKOUT_COMPLETED: "min", RUN_COMPLETED: "km", CHALLENGE_COMPLETED: "count", DAILY_GOAL_COMPLETED: "count"}

# ---- validation bounds (anti-abuse; the phone is untrusted) -------------------------------------
MAX_DAILY_STEPS = 100_000
MAX_WORKOUT_MINUTES = 300          # one workout
MAX_DAILY_WORKOUT_MINUTES = 600    # all workouts in a local day
MAX_WORKOUT_REPS = 500
MAX_RUN_KM = 100
MAX_EVENTS_PER_BATCH = 100
CLOCK_SKEW_SECONDS = 300           # occurredAt may be at most this far in the future

# ---- XP -----------------------------------------------------------------------------------------
class XpSource:
    WORKOUT = "WORKOUT"
    RUN = "RUN"
    DAILY_GOAL = "DAILY_GOAL"
    STREAK = "STREAK"
    CHALLENGE = "CHALLENGE"            # daily / special completed
    GROUP_CHALLENGE = "GROUP_CHALLENGE"
    H2H_WIN = "H2H_WIN"
    H2H_TIE = "H2H_TIE"
    ALL = {WORKOUT, RUN, DAILY_GOAL, STREAK, CHALLENGE, GROUP_CHALLENGE, H2H_WIN, H2H_TIE}


WORKOUT_BASE_XP = 30
WORKOUT_XP_PER_REP = 2
WORKOUT_XP_PER_10S = 1
WORKOUT_SESSION_CAP = 100
WORKOUT_DAILY_CAP = 300

RUN_BASE_XP = 50
RUN_XP_PER_KM = 10
RUN_TERRITORY_XP = 25
RUN_DAILY_CAP = 150


def workout_xp(minutes: float, reps: int | None) -> int:
    bonus = reps * WORKOUT_XP_PER_REP if reps else int(minutes * 60 // 10) * WORKOUT_XP_PER_10S
    return min(WORKOUT_BASE_XP + bonus, WORKOUT_SESSION_CAP)


def run_xp(km: float, territory: bool) -> int:
    return RUN_BASE_XP + round(km * RUN_XP_PER_KM) + (RUN_TERRITORY_XP if territory else 0)


# ---- daily goals (the app's daily missions that can be verified server-side) --------------------
DAILY_GOALS = [
    {"id": "steps", "label": "Walk 5,000 steps", "field": "steps", "target": 5000, "xp": 25},
    {"id": "active", "label": "Be active for 30 mins", "field": "active_minutes", "target": 30, "xp": 25},
    {"id": "workout", "label": "Complete a workout", "field": "workouts", "target": 1, "xp": 25},
]

# ---- streaks ------------------------------------------------------------------------------------
#: A day counts toward the streak when at least this many daily goals are completed on it.
STREAK_MIN_GOALS = 1
STREAK_MILESTONES = {3: 20, 7: 50, 14: 100, 30: 200, 60: 400, 100: 800}

# ---- challenges ---------------------------------------------------------------------------------
#: metric -> (unit, how it is measured)
METRICS = {
    "steps": "steps",
    "active_minutes": "min",   # workouts + runs
    "workout_minutes": "min",
    "workouts": "workouts",
    "distance_km": "km",
    "territory_km2": "km2",
}
H2H_METRICS = {"steps", "active_minutes", "workouts", "distance_km"}
H2H_WIN_XP = 150
H2H_TIE_XP = 50
H2H_MAX_OPEN_PER_USER = 5
H2H_MAX_HOURS = 7 * 24

#: Generated for every local day, per timezone (window = local_day).
DAILY_TEMPLATES = [
    {"code": "daily-move-30", "title": "Move for 30 minutes today", "description": "Workouts and runs both count.", "metric": "active_minutes", "target": 30, "xp": 40, "icon": "timer-outline"},
    {"code": "daily-steps-10k", "title": "10,000 steps", "description": "Every step from your phone counts.", "metric": "steps", "target": 10000, "xp": 40, "icon": "shoe-print"},
    {"code": "daily-run-5k", "title": "Run 5 km today", "description": "Verified runs only.", "metric": "distance_km", "target": 5, "xp": 60, "icon": "run-fast"},
]

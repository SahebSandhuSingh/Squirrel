"""Shared workout policy — every timing, limit and vocabulary the feature decides on, in one place."""

from __future__ import annotations

# A race lasts exactly one of these, chosen when the session is created. The duration is also the
# race's maximum length: ends_at = starts_at + duration, so a race can never run on.
DURATIONS_S = (60, 180, 300)

# An unstarted lobby closes this long after it was created.
LOBBY_TTL_S = 10 * 60

# Once both players are ready, the race starts this long later, so both phones count down together.
COUNTDOWN_S = 3

# Rep reports (and Finish) arriving this long after ends_at still count. Hand taps are throttled to
# one report every 500 ms, so the last ones are often in flight when time runs out. Hand-tapped
# races earn nothing, so the margin costs nothing.
REPS_GRACE_S = 5

# "connected": a socket is open, or the player made a request this recently.
CONNECTED_WINDOW_S = 10
# During the countdown or the race, this long with neither ends that player's race.
DISCONNECT_AFTER_S = 30

MAX_REPS = 2000
MAX_SEQ = 2**31 - 1

# Rep exercises a race can be run on: the app's rep-measured library entries (keys as the app sends
# them). Timed exercises (high knees, plank) can't be a rep race.
EXERCISES = {
    "squat": "Squat",
    "bicep_curl_single": "Single Arm Bicep Curl",
    "bicep_curl_double": "Double Arm Bicep Curl",
    "pushup": "Push-up",
    "lunge": "Lunges",
}

# Hand-tapped in this version. Camera-counted reps (and XP for them) come later.
REP_SOURCE = "hand_tapped"

# Invite codes: 8 characters without look-alikes (no 0/O, 1/I/L).
INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
INVITE_LENGTH = 8

# Finished sessions are deleted this long after they close (they hold names and photos).
KEEP_CLOSED_S = 7 * 24 * 3600

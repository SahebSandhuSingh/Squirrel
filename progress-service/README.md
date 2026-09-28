# progress-service: XP, levels, progress, challenges, leaderboards

The backend for **Your Progress** and **Challenges** in the Squirrel Social app. It is the single
source of truth for XP, levels, daily goals, streaks, challenge progress and results, and XP
leaderboards. The mobile app is an **untrusted client**: it reports activity and reads results.
It never sends XP, completion state, ranks or winners.

- **Stack:** Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 16, and PyJWT.
  - This is the same stack as the in-repo Exercise backend.
  - SQLite also works for quick local runs and tests.
- **Auth:** the same `Authorization: Bearer <JWT>` the app already sends to the Run Module.
  - RS256, verified with the account service's public key.
  - The JWT `sub` is the user id.
  - No second auth system: users are created on first request from the token's `sub`.

```
mobile app ──bearer──▶ /v1/*            reads progress/challenges/leaderboards, posts STEP_COUNT / WORKOUT_COMPLETED
Run Module ──X-Service-Key──▶ /internal/v1/activities   forwards finalised runs (RUN_COMPLETED)
ops / cron ──X-Service-Key──▶ /internal/v1/jobs/resolve, /internal/v1/challenges
```

## Contents

1. [Architecture](#architecture)
2. [Local development](#local-development)
3. [Environment variables](#environment-variables)
4. [Database, migrations and seed data](#database-migrations-and-seed-data)
5. [Authentication and trust model](#authentication-and-trust-model)
6. [XP logic](#xp-logic)
7. [Challenge logic](#challenge-logic)
8. [API reference (exact shapes)](#api-reference)
9. [Tests](#tests)
10. [Operations and scaling notes](#operations-and-scaling-notes)

## Architecture

```
app/
  main.py              FastAPI app, error envelope { code, detail }, CORS, /healthz
  config.py            Settings from the environment (read once)
  db.py                engine + session factory (Postgres pool / SQLite for dev)
  models.py            tables (see Schema)
  auth.py              JWT verification, user bootstrap, service-key check
  levels.py            the one level calculator (configurable curve)
  rules.py             every tunable: activity bounds, XP amounts and caps, goals, streak milestones, metrics, daily templates
  timeutil.py          user-local days/weeks (IANA timezones)
  services/
    activities.py      validate → append event → update aggregates → award XP → goals/streak → challenges   (one transaction)
    xp.py              award(): the only way XP is created (idempotent ledger insert + aggregate update)
    goals.py           daily goals and streaks
    challenges.py      join/leave, progress from the activity log, completion, head-to-head creation, resolution
    leaderboards.py    ranked XP boards (global, friends, campus) and challenge boards
    progress.py        read models: lifetime, daily, weekly (+ previous week), history, XP summary
  api/routes.py        /v1 (bearer) and /internal/v1 (service key)
  api/views.py         challenge response shape
  jobs.py              python -m app.jobs resolve | daily
  seed.py              python -m app.seed --reset
  devtoken.py          python -m app.devtoken <user_id>   (development only)
migrations/            Alembic (0001_initial)
tests/                 pytest (SQLite by default; Postgres via TEST_DATABASE_URL)
```

**Event-sourced core.**
- **Activity log:** every activity is an append-only row in `activity_events` with a per-user idempotency key.
- **Derived aggregates:** `daily_progress` (one row per user per local day) and `user_stats` (lifetime) are updated in the same database transaction as the event.
- **XP ledger:** every XP change is a row in the auditable `xp_transactions`.
- **Per-user locking:** each write takes a row lock on the user's `user_stats` row (`SELECT … FOR UPDATE`). This serialises one user's writes, so caps, goals and streaks can't be raced. Different users never block each other.

**Challenge progress is never stored from the client.**
- Progress is a SQL aggregate over `activity_events` inside the challenge window. The window is the user's local day for dailies, or `[startsAt, endsAt)` otherwise.
- It is recomputed when a relevant event arrives, when the user joins, and at resolution.
- `challenge_participants.progress` is a cache of that value, used for boards and responses.

### Schema

| table | purpose | keys / constraints / indexes |
|---|---|---|
| `users` | id = JWT `sub`, display name, avatar, campus, IANA timezone | PK id; ix campus |
| `follows` | friends leaderboard population | PK (follower, followee); FK both → users; CHECK no self-follow; ix followee |
| `activity_events` | append-only activity log (client, run_module, exercise, system) | UNIQUE (user_id, idempotency_key); ix (user_id, type, occurred_at); ix (user_id, local_date); FK user |
| `xp_transactions` | XP ledger `(id, user_id, amount, source, source_id, metadata, local_date, created_at)` | **UNIQUE (user_id, source, source_id)**; CHECK amount > 0; ix (user_id, created_at); ix (local_date, user_id) |
| `daily_progress` | per user per local day: xp, steps, workouts, minutes, distance, calories, challenges, goals | PK (user_id, local_date); ix (local_date, xp) |
| `user_stats` | lifetime totals, current/longest streak, last streak date | PK user_id; ix total_xp |
| `challenges` | kind daily/head_to_head/group/special, metric, target, xp reward (+tie), window, times, status, max participants, rules JSON, winner | CHECK kind/status/window/ends > starts; UNIQUE (code, local_date) for dailies; ix (status, ends_at); ix (kind, starts_at, ends_at) |
| `challenge_participants` | membership, status, progress, contribution, timestamps | **UNIQUE (challenge_id, user_id)**; ix (user_id, status); ix (challenge_id, progress); FKs |

All tables have `created_at` (and `updated_at` where rows change). All foreign keys cascade on user delete.

## Local development

```bash
cd progress-service
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then export the values, or use a tool like direnv

# PostgreSQL (recommended). Any Postgres 14+ works, e.g.:
#   docker run -d --name sq-pg -e POSTGRES_USER=squirrel -e POSTGRES_HOST_AUTH_METHOD=trust -p 5433:5432 postgres:16
#   createdb -h 127.0.0.1 -p 5433 -U squirrel squirrel_progress
export DATABASE_URL=postgresql+psycopg://squirrel@127.0.0.1:5433/squirrel_progress
export JWT_DEV_SECRET=dev-only-change-me-at-least-32-bytes-long SERVICE_API_KEY=dev-service-key

alembic upgrade head
python -m app.seed --reset                       # 10 users, all challenge kinds, a week of activity
uvicorn app.main:app --reload --port 8090

TOKEN=$(python -m app.devtoken u_aanya --name "Aanya S.")
curl -H "Authorization: Bearer $TOKEN" localhost:8090/v1/progress
```

Point the app at it with `EXPO_PUBLIC_PROGRESS_API_URL=http://<your-ip>:8090` in `mobile/.env`.
Then sign in with **Paste a developer token** (see `mobile/README.md`). For the Expo web build,
set `CORS_ORIGINS=http://localhost:8081`.

Quick runs without Postgres: `DATABASE_URL=sqlite:///./progress.db alembic upgrade head`.

## Environment variables

| variable | default | meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./progress.db` | SQLAlchemy URL. Production: `postgresql+psycopg://user:pass@host:5432/db` |
| `APP_ENV` | `development` | `production` disables dev tokens and the seed |
| `JWT_ALGORITHMS` | `RS256` | accepted asymmetric algorithms (comma-separated) |
| `JWT_PUBLIC_KEY` / `JWT_PUBLIC_KEY_FILE` | — | PEM of the account service's signing key |
| `JWT_ISSUER`, `JWT_AUDIENCE` | — | verified when set |
| `JWT_DEV_SECRET` | — | development/tests only: also accept HS256 tokens signed with it. Ignored in production |
| `SERVICE_API_KEY` | — | shared secret for `/internal/v1/*` (header `X-Service-Key`). Internal routes return 403 when unset |
| `LEVEL_CURVE` | `linear:2000` | `linear:<xp per level>` or `thresholds:0,1000,2500,…` (the final gap repeats) |
| `DEFAULT_TIMEZONE` | `Asia/Kolkata` | timezone for new users until `PATCH /v1/me` sets theirs |
| `OFFLINE_SYNC_WINDOW_DAYS` | `7` | oldest `occurredAt` accepted (offline queue) |
| `CHALLENGE_RESOLVE_GRACE_MINUTES` | `120` | challenges resolve this long after they end, so late offline events still count |
| `CORS_ORIGINS` | — | comma-separated browser origins (web build). Native apps don't need it |

## Database, migrations and seed data

- `alembic upgrade head` creates everything. `alembic revision --autogenerate -m "…"` creates new migrations, and `alembic check` must report no drift.
- `0001_initial` is portable: it runs on Postgres and SQLite.
- `python -m app.seed --reset` wipes the tables and seeds through the real engine (refused when `APP_ENV=production`). Because it uses the real engine, every XP row, streak and challenge result is consistent. It creates:
  - **10 users** on Ganeshkhind Campus, the demo people from `mobile/src/data/users.ts` (`u_aanya`, `u_rhea`, …). `u_aanya` follows 4 of them.
  - **Daily challenges** for each of the last 7 days.
  - **Group challenges:** *Runners: 500 km* (campus rule) and *Early Birds: 1,000 active min* (completes during the seed week).
  - **Special challenges:** *Weekend Warrior* (max 50) and *Night Owl 10K* (level 5+).
  - **Head-to-head:** a live 7-day step duel (Aanya vs Rhea), a resolved duel (Aanya beat Dev) and a pending invite (Kabir → Aanya).
  - **A week of activity** per person: steps, workouts, and runs forwarded as trusted run-module events. XP, goals, streaks and leaderboards all follow from it.

## Authentication and trust model

| never trusted from the client | how it's enforced |
|---|---|
| user id | identity is the verified token's `sub`. No endpoint takes a user id from a user. Unknown body fields (`userId`, `xp`, `completed`, `winner`…) are rejected with 422 (`extra="forbid"`) |
| XP values | there is no XP-writing endpoint. XP is created only by `services/xp.award()`, from server-side rules |
| workout/run claims | clients may send only `STEP_COUNT` and `WORKOUT_COMPLETED`, bounded (see `rules.py`: ≤100k steps/day, ≤300 min/workout, ≤600 min/day, ≤500 reps). `RUN_COMPLETED` is accepted only from the Run Module over the service key, after it has verified the GPS track |
| timestamps | must carry a UTC offset. At most 5 min in the future, at most `OFFLINE_SYNC_WINDOW_DAYS` old |
| challenge completion / winners / ranks | computed from the activity log. Completion, head-to-head winners and ties are decided on the server. Ranks come from SQL `RANK()` |
| someone else's progress | reads and writes are scoped to the token's user. Head-to-heads are invisible (404) to non-players, and joining someone else's duel returns 403 |
| re-completion | UNIQUE (user, source, source_id) on the XP ledger, and UNIQUE (challenge, user) on participants |

**Idempotency.**
- **Activity:** every event needs an `idempotencyKey`. A replay returns `status: "duplicate"` with the original event id and awards nothing. This also holds under concurrency (`tests/test_concurrency.py`: 16 parallel copies award XP once).
- **XP awards:** each award has a natural key.

  | award | natural key |
  |---|---|
  | workout / run | event id |
  | daily goal | `"<date>:<goal>"` |
  | streak milestone | `"<n>:<date>"` |
  | challenge / group / head-to-head | challenge id |

  Inserts run in a savepoint, and a unique-constraint hit means "already awarded" (0 XP).

**Steps are cumulative.** Pedometers report a running daily total, so the server credits only the increase over the day's highest reading. A lower or repeated reading credits 0.

## XP logic

All numbers live in `app/rules.py`.

| source | amount | cap |
|---|---|---|
| `WORKOUT` | 30 + 2/rep (or +1 per 10 s for timed work) | 100 per session, 300 per local day |
| `RUN` (trusted) | 50 + 10/km + 25 if new territory | 150 per local day (matches the Run Module) |
| `DAILY_GOAL` | 25 each: 5,000 steps · 30 active minutes · 1 workout | once per goal per day |
| `STREAK` | milestones 3→20, 7→50, 14→100, 30→200, 60→400, 100→800 | once per milestone per streak run |
| `CHALLENGE` | the challenge's `xpReward` (daily / special) | once per challenge |
| `GROUP_CHALLENGE` | `xpReward` to every member who contributed (> 0) | once |
| `H2H_WIN` / `H2H_TIE` | 150 / 50 each (defaults) | once |

**Levels.** `calculate_level(totalXP)`, `get_xp_for_next_level(totalXP)` and `level_info(totalXP)` return `{ level, currentXP, xpForCurrentLevel, xpForNextLevel, progress }`. The curve is `LEVEL_CURVE`. The default `linear:2000` matches the app's existing 2,000 XP per level.

**Streaks.**
- A day counts when at least one daily goal is completed on it, in the user's timezone.
- Consecutive days increase the streak, and a gap resets it to 1.
- A late (offline) event for an earlier day recomputes the streak from history.
- `todayStatus` is `done`, `at_risk` (streak alive, nothing yet today) or `none`.

**Timezone.**
- `users.timezone` (IANA name, set with `PATCH /v1/me`) defines each user's day and week (Monday start).
- `activity_events.local_date` is fixed at write time from `occurredAt`.
- Daily/weekly boards are computed over the requester's local day or week.

## Challenge logic

| kind | who | progress | result |
|---|---|---|---|
| `daily` | anyone, today only | the user's metric for their local day | auto-complete at target → `CHALLENGE` XP once. Unfinished → `failed` at resolution |
| `head_to_head` | two players. Challenger is `active`, opponent `invited` until they accept | each player's metric over `[startsAt, endsAt)` | resolved after the end + grace: higher score wins (`H2H_WIN`), equal scores tie (both `H2H_TIE`), leaving = forfeit, never accepted = cancelled (no XP). Max 5 open duels per user, 1–168 h |
| `group` | anyone (optionally `rules.campus`) | collective = sum of members' contributions | when the collective reaches the target, it completes once and every contributor gets `GROUP_CHALLENGE` XP. Later joins are refused |
| `special` | limited-time. `rules.minLevel`, `rules.campus`, `maxParticipants` | the user's metric in the window | like daily, with a custom `xpReward` |

**Metrics.**

| metric | computed from |
|---|---|
| `steps` | credited steps |
| `active_minutes` | workout + run minutes |
| `workout_minutes` | workout minutes |
| `workouts` | count of workouts |
| `distance_km` | verified runs only |
| `territory_km2` | verified runs only |

**Participation rules.**
- Duplicate joins return 409 `already_joined`. Completed participants get 409 `already_completed`.
- Ended or closed challenges return 409 `challenge_expired` / `challenge_closed`.
- Eligibility failures return 403 `not_eligible`, and a full challenge returns 409 `challenge_full`.
- The rules also apply to re-joins after leaving.
- Activity logged inside the window before joining counts. Joining can complete a challenge immediately.
- `canJoin` and `ineligible` in every challenge response tell the app what the server will accept.

**Resolution.**
- `resolve_due()` closes challenges whose end + `CHALLENGE_RESOLVE_GRACE_MINUTES` has passed. It is idempotent and uses `FOR UPDATE SKIP LOCKED` on Postgres, so several workers are safe.
- It runs lazily on every challenge request, and should also run on a schedule: `python -m app.jobs resolve` every 5 min, or `POST /internal/v1/jobs/resolve`.
- `python -m app.jobs daily` pre-creates today's dailies. They're also created lazily.

## API reference

Every error is `{ "code": "<machine_code>", "detail": "<human text>" }`:
- 401 — missing, invalid or expired token (`WWW-Authenticate: Bearer`)
- 403 — not allowed / wrong service key
- 404 — not found
- 409 — state conflict
- 422 — invalid input (`code: invalid_request`)
- 429 — too many open duels

All `/v1` routes need `Authorization: Bearer <JWT>`.

### Me
- `GET /v1/me` → `{ userId, displayName, avatarUrl, campus, timezone }`
- `PATCH /v1/me` `{ displayName?, avatarUrl?, campus?, timezone? }` → same (timezone must be IANA)
- `PUT /v1/me/following/{userId}` → 204; `DELETE /v1/me/following/{userId}` → 204

### Progress
`GET /v1/progress` (lifetime + today):
```json
{ "userId": "u_aanya", "timezone": "Asia/Kolkata", "totalXp": 2001,
  "level": { "level": 2, "currentXP": 2001, "xpForCurrentLevel": 2000, "xpForNextLevel": 4000, "progress": 0.0005 },
  "totalWorkouts": 8, "totalWorkoutMinutes": 182.0, "totalActiveMinutes": 242.0, "totalSteps": 46800,
  "totalDistanceKm": 10.56, "totalCalories": 0, "challengesCompleted": 7,
  "streak": { "current": 7, "longest": 7, "lastQualifyingDate": "2026-09-28", "todayStatus": "done" },
  "today": { "...": "GET /v1/progress/daily" } }
```
`GET /v1/progress/daily?date=YYYY-MM-DD` (default: the user's today):
```json
{ "date": "2026-09-28", "xp": 438, "steps": 0, "workouts": 2, "workoutMinutes": 32.0, "activeMinutes": 32.0,
  "distanceKm": 0.0, "calories": 0, "challengesCompleted": 2, "goalsCompleted": 2,
  "goals": [ { "id": "steps", "label": "Walk 5,000 steps", "current": 0, "target": 5000, "xp": 25, "completed": false },
             { "id": "active", "label": "Be active for 30 mins", "current": 32.0, "target": 30, "xp": 25, "completed": true },
             { "id": "workout", "label": "Complete a workout", "current": 2, "target": 1, "xp": 25, "completed": true } ],
  "goalsTotal": 3, "streak": { "current": 7, "longest": 7, "lastQualifyingDate": "2026-09-28", "todayStatus": "done" }, "isToday": true }
```
`GET /v1/progress/weekly?weekStart=YYYY-MM-DD` (Monday; default this week):
```json
{ "weekStart": "2026-09-28", "weekEnd": "2026-10-04", "xp": 438, "steps": 0, "workouts": 2, "workoutMinutes": 32.0,
  "activeMinutes": 32.0, "distanceKm": 0.0, "calories": 0, "challengesCompleted": 2, "goalsCompleted": 2, "activeDays": 1,
  "streak": { "...": "as above" },
  "previous": { "xp": 1563, "steps": 46800, "workouts": 6, "workoutMinutes": 150.0, "activeMinutes": 210.0, "distanceKm": 10.56,
                "calories": 0, "challengesCompleted": 5, "goalsCompleted": 15, "activeDays": 6 },
  "change": { "xp": -0.7198, "steps": -1.0, "workouts": -0.6667, "workoutMinutes": -0.7867, "activeMinutes": -0.8476, "challengesCompleted": -0.6 },
  "days": [ { "date": "2026-09-28", "xp": 438, "steps": 0, "workouts": 2, "workoutMinutes": 32.0, "activeMinutes": 32.0,
              "distanceKm": 0.0, "calories": 0, "challengesCompleted": 2, "goalsCompleted": 2 }, "… 7 in total" ] }
```
`change` is `(this − previous) / previous`, or `null` when last week was 0.

`GET /v1/progress/history?days=30` (1–366) or `?from=&to=` → `{ from, to, days: [DayRow…] }`. The series is zero-filled and oldest first.

### XP and levels
- `GET /v1/xp` → `{ totalXp, level: LevelInfo, today, week, bySource: { WORKOUT: 546, RUN: 280, … } }`
- `GET /v1/xp/history?limit=50&cursor=0` → `{ items: [{ id, amount, source, sourceId, metadata, date, createdAt }], nextCursor }`
- `GET /v1/levels/{totalXp}` → `LevelInfo`

### Activities
`POST /v1/activities` (1–100 events; each is committed on its own):
```json
{ "events": [ { "idempotencyKey": "exercise:1727520000000:squat-1", "type": "WORKOUT_COMPLETED", "value": 12,
                "occurredAt": "2026-09-28T11:52:00Z", "metadata": { "exercise": "squat", "reps": 20, "calories": 60, "sessionId": "1727520000000" } } ] }
```
→
```json
{ "results": [ { "idempotencyKey": "…", "status": "accepted", "eventId": "…", "xpAwarded": 135, "goalsCompleted": ["active"], "challengesCompleted": ["daily-move-30:2026-09-28"] },
               { "idempotencyKey": "…", "status": "duplicate", "eventId": "…", "xpAwarded": 0, "goalsCompleted": [], "challengesCompleted": [] },
               { "idempotencyKey": "…", "status": "rejected", "code": "invalid_value", "detail": "workout minutes must be between 0 and 300" } ],
  "progress": { "...": "GET /v1/progress/daily" }, "xp": { "...": "GET /v1/xp" } }
```
Event types for the app:
- `STEP_COUNT` — `value` is today's cumulative steps.
- `WORKOUT_COMPLETED` — `value` is minutes.

Rejection codes: `type_not_allowed`, `invalid_value`, `invalid_metadata`, `future_timestamp`, `too_old`, `timestamp_needs_timezone`, `daily_limit`.

`GET /v1/activities?type=&limit=&cursor=` → `{ items: [{ id, type, value, credited, unit, source, metadata, occurredAt, date, idempotencyKey }], nextCursor }`

### Challenges
`GET /v1/challenges?kind=daily|head_to_head|group|special&status=current|ended|mine` → `{ challenges: [Challenge…] }`

Every Challenge has:
```json
{ "id": "daily-move-30:2026-09-28", "kind": "daily", "title": "Move for 30 minutes today", "description": "Workouts and runs both count.",
  "icon": "timer-outline", "metric": "active_minutes", "unit": "min", "target": 30.0, "xpReward": 40,
  "startsAt": "2026-09-27T18:30:00Z", "endsAt": "2026-09-28T18:30:00Z", "endsInMinutes": 397,
  "status": "active", "participants": 10, "maxParticipants": null, "rules": {},
  "joined": true, "canJoin": false, "closedReason": null, "ineligible": null,
  "me": { "current": 32.0, "target": 30.0, "progress": 1.0, "completed": true, "status": "completed" } }
```
- `status` (as this user sees it): `upcoming | active | completed | ended | cancelled`.
- `me.status` (participant): `invited | active | completed | left | won | lost | tied | failed | cancelled`, or `null` if not joined.
- `ineligible`: `{ code: "not_eligible" | "challenge_full", detail }` when the challenge is open but this user can't join.

Additional fields by kind:
- **group:** `"group": { "name": "Early Birds", "collective": 1015.0, "members": 8, "completedAt": "2026-09-25T02:01:00Z" }`
- **head_to_head:** `"target": null`, `"xpRewardTie": 50`, `"opponent": { "userId": "u_rhea", "name": "Rhea K.", "avatar": null, "score": 56840.0, "status": "active" }`, `"winnerUserId": null`, `"invited": false`

Other challenge endpoints:
- `GET /v1/challenges/{id}` → Challenge. Head-to-heads you're not in return 404.
- `GET /v1/challenges/{id}/progress` → `{ current, target, progress, completed, status }` (+ `collective` for group). Returns 404 `not_participating` if you haven't joined.
- `POST /v1/challenges/{id}/join` → Challenge. For a head-to-head invite, this accepts it.
- `POST /v1/challenges/{id}/leave` → Challenge. Declines an invite / forfeits a duel.
- `POST /v1/challenges/head-to-head` `{ opponentId, metric: steps|active_minutes|workout_minutes|workouts|distance_km|territory_km2, durationHours: 1–168 }` → 201 Challenge.

### Leaderboards
- `GET /v1/leaderboards` → `{ types: [global, friends, campus, challenge, group], periods: [daily, weekly, alltime] }`
- `GET /v1/leaderboards/{global|friends|campus}?period=weekly&limit=50&cursor=0`:
```json
{ "type": "global", "period": "weekly", "metric": "xp", "rank": 1, "me": { "rank": 1, "xp": 438 },
  "users": [ { "rank": 1, "userId": "u_aanya", "name": "Aanya S.", "avatar": null, "xp": 438 },
             { "rank": 2, "userId": "u_aarav", "name": "Aarav M.", "avatar": null, "xp": 218 } ],
  "total": 10, "nextCursor": 2 }
```
  - Ranking is deterministic: competition ranking (`RANK()`: equal scores share a rank, the next rank skips), ordered by rank then user id. Only users with XP > 0 in the period are ranked.
  - `friends` = the people you follow plus you.
  - `campus` needs `campus` on your profile (409 otherwise).
- `GET /v1/leaderboards/{challenge|group}?challengeId=…` → `{ type, challengeId, metric, unit, rank, me: { rank, score }, users: [{ rank, userId, name, avatar, score, status }], total, nextCursor }`

### Internal (header `X-Service-Key`)
- `POST /internal/v1/activities` `{ userId, source: "run_module" | "exercise", events: [...] }`. Same response as `/v1/activities`, and `RUN_COMPLETED` is allowed. The Run Module calls this after a run is `finalized`:
  - `idempotencyKey = "run:<run_id>"`
  - `value = distance_m / 1000`
  - `metadata = { minutes: moving_time_s / 60, territoryM2: territory.area_m2, runId }`
- `POST /internal/v1/challenges` `{ id?, kind: group|special, title, description, metric, target, xpReward, startsAt, endsAt, maxParticipants?, groupName?, icon?, rules? }` → 201 `{ id }`
- `POST /internal/v1/jobs/resolve` → `{ resolved: [ids] }`
- `GET /healthz` → `{ ok: true }` (checks the database)

## Tests

```bash
pytest -q                                                                                        # SQLite
TEST_DATABASE_URL=postgresql+psycopg://squirrel@127.0.0.1:5433/squirrel_progress_test pytest -q   # Postgres (+ concurrency tests)
```

The suite has 45 tests.

| file | covers |
|---|---|
| `test_xp_levels.py` | XP awarded, duplicates, invalid input, caps, cumulative steps, levels |
| `test_challenges.py` | join/duplicate/expired, completion once, rules, capacity, group contributions |
| `test_head_to_head.py` | server-side winner, tie, forfeit, cancel, privacy, validation |
| `test_progress.py` | daily, lifetime, weekly vs previous, streaks, history, timezones |
| `test_security_leaderboards.py` | auth, service key, identity, tampering, deterministic ranking, friends/campus |
| `test_concurrency.py` | parallel duplicates, parallel caps (Postgres) |
| `test_flow.py` | USER → ACTIVITY → PROGRESS → CHALLENGE PROGRESS → COMPLETION → XP → LEVEL → LEADERBOARD |

## Operations and scaling notes

- **Horizontal scaling.** The API is stateless. Correctness comes from per-user row locks, unique constraints and savepoints, not from process memory.
- **Jobs.** Run `python -m app.jobs resolve` every few minutes (any number of workers, thanks to SKIP LOCKED).
- **Leaderboards.**
  - Weekly/daily boards `SUM` `daily_progress` over at most 7 rows per user, using the `(local_date, xp)` index. All-time boards read `user_stats.total_xp`.
  - At large scale, cache the top N per period, e.g. in Redis, invalidated on XP writes, or use a materialised view refreshed each minute. Ranks stay derived, never stored from clients.
- **Retention.** `activity_events` is append-only. Partition it by month once it's large, since aggregates don't need old rows.
- **Overlap with the Run Module.** The Run Module still computes run XP for its own `/v1/users/me/xp`. With this service configured, the app treats this service as the XP authority, and runs arrive via `/internal/v1/activities`. Long term, the Run Module should stop awarding XP itself.

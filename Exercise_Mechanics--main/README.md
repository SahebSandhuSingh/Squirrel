# Exercise Mechanics

Exercise Mechanics is a browser-based live fitness-coaching prototype. MediaPipe pose inference runs in the
React frontend, while FastAPI owns setup, exercise state, form evaluation, scoring and coaching
cues.

The currently usable exercises are **Squat**, **Single / Double Arm Bicep Curl**, **High Knees**, and
**Push-up**. Lunges and Plank appear in the library but are still **Coming Soon**.

> **Push-up is the first SIDE-view exercise.** Elbow bend and hip alignment are both sagittal-plane
> quantities, so the setup flow refuses to start a set until the camera is at the user's side, and it
> keeps checking during the set — a confirmed front-on view pauses the rep machine rather than scoring
> readings the angle cannot support. Its thresholds are `development` and were derived geometrically
> rather than from a rig capture; `backend/workouts/pushup/configs/templates.yaml` records what each
> one needs before it can be promoted to `ready`.
>
> Being side-on changes what the client has to do, not just the server. A profile view occludes the
> far arm and leg, so tracking confidence is scored from the best single side rather than the worst
> joint across both — otherwise a correctly positioned user sits below the confidence floor for the
> whole set. And when `side_view_orientation` invalidates a reading, `tracking.invalidated_by` names
> it, so the HUD can say *"turn side-on, reps are not being counted"* instead of the generic
> *"hold still for tracking"*, which is the opposite of what that user needs to do.
>
> **To watch the push-up rules run**, there is a local OpenCV tool that feeds a camera, a video file
> or a drawn synthetic body through the real setup gate and the real live adapter and draws what
> they return — depth percentage, rep verdicts, sag/pike, the camera check and the cues:
>
> ```bash
> pip install -r backend/tools/requirements-vision.txt
> python backend/tools/live_pushup.py --source synthetic --window   # no camera needed
> python backend/tools/live_pushup.py --source 0 --window           # webcam
> python backend/tools/live_pushup.py --source clip.mp4 --out annotated.mp4
> ```
>
> The requirements file pins MediaPipe to 0.10.21 on purpose: newer releases dropped the legacy
> CPU-only `mp.solutions` API, and their Tasks API aborts on macOS inside a Metal calculator. See
> the note at the top of `backend/tools/requirements-vision.txt`.

> **New here?** [`USER_GUIDE.md`](USER_GUIDE.md) is a plain-language, step-by-step walkthrough of
> installing, starting, and using the app. Start there. This README is the quick technical reference.

## The app currently opens straight on a push-up set

`DEMO_PUSHUP` in `frontend-react/src/App.tsx` is `true`, so loading the app skips the landing page,
the profile choice, the program choice and the workout builder, and mounts the coach directly on a
one-set push-up. `frontend-react/src/flow/demoSession.ts` provisions the identity and the session
non-interactively and hands the coach the same `(session_id, WorkoutConfig)` pair the Solo builder
produces — nothing downstream is stubbed or shortened.

| To get | Do |
|---|---|
| the full flow, once | open `/?demo=off` |
| the full flow, by default | set `DEMO_PUSHUP = false` in `App.tsx` |

Everything below describes the app with the demo switched off, since that is the flow the other
exercises are reached through.

## Supported runtime

| Runtime | Supported version |
|---|---|
| Python | 3.11.9 (Python 3.11 patch releases are expected to work) |
| Node.js | 22.22.3 (Node 22.12 or newer) |
| npm | 10.x |

The repository records the verified versions in `.python-version` and `.nvmrc`.

## Clean setup

Run these commands from the repository root unless a step says otherwise.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Install the frontend exactly from the committed lock file:

```bash
cd frontend-react
npm ci
cd ..
```

Do not copy another developer's virtual environment or `node_modules`. Those directories contain
machine-specific paths and are intentionally not shipped with this codebase.

## Verification

Backend:

```bash
.venv/bin/python -m pytest -q
```

Frontend:

```bash
cd frontend-react
npm run typecheck
npm run lint
npm run test
npm run build
cd ..
```

`npm run build` writes a fresh production bundle to `frontend-dist/`. That directory is generated and
not shipped; never assume an existing bundle matches the current React source.

## Run the application

Build the frontend first, then start FastAPI from the repository root:

```bash
cd frontend-react
npm run build
cd ..
.venv/bin/python -m uvicorn backend.main:app --reload --port 8000
```

Open [http://localhost:8000](http://localhost:8000). API and WebSocket routes are registered before
the frontend static mount. With `DEMO_PUSHUP` on this lands on the push-up setup screen; append
`?demo=off` for the landing page.

Re-run `npm run build` after every change to `frontend-react/`, including after a `git pull`.
`frontend-dist/` is gitignored, so pulling updates the source but leaves the served bundle exactly
as it was — the symptom is a page that stubbornly shows the previous version of the UI.

### First run — build before you serve

The build step above is not optional on a fresh clone. `frontend-dist/` is generated output and is
not in version control, but `backend/main.py` mounts it as static files at import time. Starting
uvicorn before the first `npm run build` therefore fails immediately with:

```
RuntimeError: Directory '.../frontend-dist' does not exist
```

Run `npm run build` in `frontend-react/` and start uvicorn again.

### Frontend development, with hot reload

Two terminals, two directories. Keep FastAPI running in one:

```bash
# terminal 1, from the repository root
.venv/bin/python -m uvicorn backend.main:app --reload --port 8000
```

```bash
# terminal 2
cd frontend-react
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite serves from source and proxies `/api` and
`/ws` to FastAPI on port 8000, so there is no bundle to rebuild and none to go stale.

`ModuleNotFoundError: No module named 'backend'` means uvicorn is running from the wrong directory —
`backend.main` is a dotted import, so the current directory must be the one *containing* `backend/`.
Uvicorn prints the directory it is watching on its first line; that line must end in the repository
root, not in `/backend` or `/frontend-react`.

A Vite `http proxy error: ECONNREFUSED` on `/api/...` means terminal 1 is not running.

### Exercise availability

Every enabled exercise uses the standard launch command above; none needs an environment variable.
The backend catalog (`backend/workouts/catalog.yaml`) decides what the library offers — an enabled
entry shows **Add to workout**, a planned one stays unavailable.

## Deployment

`Dockerfile` builds both halves into one image: a Node stage runs `npm run build`, and the Python
stage copies the resulting `frontend-dist/` in beside the backend. Node is not in the final image.
The container serves the API, the WebSockets and the SPA from **one origin**, which is what the
client assumes — `useEngine.ts` builds its socket URL from `location.host`, and every `fetch` is a
relative `/api/...`.

```bash
# from Exercise_Mechanics--main/ — the Dockerfile's COPY paths are relative to it
docker build -t exercise-mechanics .
docker run --rm -p 8000:8000 exercise-mechanics
```

`Bind for 0.0.0.0:8000 failed: port is already allocated` means something else holds the port,
usually a local uvicorn — stop it, or publish elsewhere with `-p 8080:8000`. The app is entirely
same-origin, so any host port works.

The image reads `$PORT` (default 8000) and binds `0.0.0.0`, so it runs unchanged on a container
host. On Render, Railway, Fly.io or Cloud Run:

| Setting | Value |
|---|---|
| Runtime | Docker |
| Root directory | `Exercise_Mechanics--main` |
| Dockerfile path | `Exercise_Mechanics--main/Dockerfile` |
| Build / start command | *leave empty* — the Dockerfile `CMD` already binds `$PORT` |
| Environment variables | optional — see the table below |
| Health check path (optional) | `/api/exercises` |

The core app needs no environment variables beyond `PORT`, which the Dockerfile handles. These are
optional and switch features on:

| Variable | Used by | Without it |
|---|---|---|
| `RUN_MODULE_URL`, `RUN_MODULE_TOKEN` | Partner Hunt's XP gate (the Run Module) | Partner Hunt reports the XP service as unavailable |
| `PARTNER_HUNT_DEV_XP` | Local testing only: a fixed XP for every user | — |
| `MODERATION_TOKEN` | Moderator routes for reports | Moderator routes refuse every request (503) |
| `DATABASE_URL` | PostgreSQL copy of exercise sessions (see below) | Sessions are stored on disk only, as before |
| `SQUIRREL_AUTH_SECRET` | Signs Squirrel Social login tokens (see below). **Required in production** | A development key is generated once in `data/auth/secret.key` |
| `SQUIRREL_PUBLIC_BASE_URL` | Origin used in QR codes and invite links | `https://squirrelsocial.app` |
| `SQUIRREL_APP_STORE_URL`, `SQUIRREL_PLAY_STORE_URL`, `SQUIRREL_IOS_APP_IDS`, `SQUIRREL_ANDROID_PACKAGE`, `SQUIRREL_ANDROID_CERT_SHA256` | Store links and the Universal/App Link files | Placeholder store listings |

**Serverless hosts (Vercel, Netlify Functions, Lambda) cannot run this.** `/ws/setup` and `/ws/train`
are long-lived WebSockets carrying every pose frame, and the backend writes profiles, sessions and
captured baselines to local disk. Hosting the SPA there and the API elsewhere would additionally
need a configurable backend origin and CORS, neither of which exists today.

### Persistence in a container

`data/users/` is inside the container and is **not** in the image (`.dockerignore` excludes it), so
without a mounted volume it starts empty and is wiped on every restart and redeploy. Mount it to
keep profiles, sessions and baselines:

```bash
docker run --rm -p 8000:8000 -v "$PWD/data:/app/data" exercise-mechanics
```

Running without a volume is survivable rather than broken: a browser holding a cached identity the
server no longer has gets a 404 on session creation, and `demoSession.ts` recovers by creating a
fresh profile. History and saved baselines are lost, a demo still runs.

## Sign-up profile details

Sign-up is two pages:

1. **Page 1** (`Onboarding.tsx` → `POST /api/users`): name, date of birth, gender, height, weight,
   mobile and email. This creates the account. The payload is the same as before.
2. **Page 2** (`ProfileDetails.tsx` → `PUT /api/users/{id}/details`): fitness, activities, physique
   and habits, all optional, with a **Skip for now** button. Physique and habits each have their own
   consent box, and their questions only appear once it's ticked. Everything on the page is saved in
   one request; a refused request saves nothing, and sections left out are left unchanged.

The code is in `backend/profiles/`, and each answer can also be changed later through its own route.

| Question | Where it lives | Rule |
|---|---|---|
| Age | `profile.json` → `date_of_birth` | Only the date of birth is stored; age is always worked out from it |
| Gender | `profile.json` → `gender` | One of `female`, `male`, `non_binary`, `other`, `undisclosed` |
| Activities | `activities.json` | Codes from `GET /api/activity-types`; tracked exercises use their workout slugs |
| BMI | `measurements.json` (history) | Never stored: latest height × latest weight. `GET /api/users/{id}` returns the latest values |
| Fitness level, activity level, goal | `skill.json`, `fitness.json` | Fitness level *is* the dashboard skill level, with no second copy |
| Physique (body type, body fat, waist) | `physique.json`, `measurements.json` | **Needs `physique` consent** |
| Habits (workout times, sleep, diet, smoking, alcohol) | `habits.json` | **Needs `habits` consent** |

Consent is an append-only log (`consents.json`, `POST /api/users/{id}/consents`), with three
categories: `physique`, `habits` and `matching` (the opt-in to activity matching, below). Withdrawing
physique or habits consent erases that category's data. If the log can't be read, consent is treated as not given:
sensitive data is hidden and not saved, and the log is never overwritten. Sensitive questions
always offer a "prefer not to say" answer.

Routes: `GET /api/users/{id}/details` (everything, with age and BMI derived);
`PUT /api/users/{id}/details` (page 2, all at once);
`PUT /api/users/{id}/details/{fitness|activities|physique|habits}`;
`GET|POST /api/users/{id}/measurements`; `GET|POST /api/users/{id}/consents`.

## Workout Score and Activity Rating

Two separate things, never mixed:

| | Workout Score | Activity Rating |
|---|---|---|
| Who produces it | The system | The member |
| From | Measured workout data: reps, depth, technique, duration, consistency | How the member felt about the session and how they'd rate it |
| Field in reports | `workout_score` | `activity_rating` |
| Code | `backend/reports/workout_score.py` | `backend/activity_rating/` |

A rating never changes the score, and the rating is not part of `activity_metrics`.

### Workout Score

Every exercise report (`GET /api/users/{id}/sessions/{sid}/report` and `.../exercises/{ex}/report`)
carries a `workout_score`: one 0–100 number with feedback, built only from what pose detection and
rep analysis captured. The frontend doesn't show it yet.

| Part | Weight | From |
|---|---|---|
| Technique | 40% | Each rep's technique score: 100 minus penalties for flagged form faults |
| Depth | 25% | Each rep's depth factor against the exercise's full-range gate |
| Completion | 20% | Reps done ÷ reps planned (timed: sets completed ÷ planned) |
| Consistency | 15% | Steadiness of rep scores and rep tempo (timed: left/right balance) |

- A rep's form score is already technique × depth, so the two are kept separate here and depth is
  counted once. A part that couldn't be measured is left out and the weights are rescaled.
- Grades: 90+ Excellent · 75+ Strong · 60+ Solid · 40+ Building · below 40 Getting started.
- Feedback: a headline, up to two strengths, and one focus (the weakest part below 85) with a fix.
  A technique focus names the costliest form fault and its coaching text from the exercise
  templates. `trend` compares with the last earlier session of the same exercise.
- At least 3 tracked reps are needed. If most reps had incomplete tracking, the score is marked
  `provisional`.
- `correct_pct` counts reps with form 80+ **and** full depth. The report also carries
  `activity_metrics` (`reps`, `correct_pct`, `avg_depth`, `workout_score`), the `metrics` object
  for the shared `activity_sessions` row in the Integration Contract.
- Session overviews and `/progress` sessions carry `workout_score` too.

### Activity Rating

The member rates a session they did: `PUT /api/users/{id}/sessions/{sid}/activity-rating` with
`rating` (1–5, required), and optionally `feeling` (`great`, `good`, `okay`, `tired`, `bad`),
`effort` (perceived exertion, 1–10) and a `note` of up to 500 characters. `GET` reads it and `DELETE`
removes it. Only the session's own member can rate it; re-rating keeps the first `rated_at`. It is
stored beside the session (`activity_rating.json`) and appears as `activity_rating` in session and
exercise reports, overviews, and (the 1–5 value) in `/progress` sessions.

## Reports (moderation)

Members can report another member, or one of their sessions, for review (`backend/moderation/`).
Each report records who reported, whom or what, the category, a description, when, and a status.

- **Categories:** `harassment`, `fake_profile`, `inappropriate_content`, `spam`, `cheating`
  (manipulated workout data; can name a `session_id`), `other` (needs a description).
- **Status:** `open` → `in_review` → `resolved` or `dismissed`, with every change kept in the
  report's `history`.
- **Members:** `POST /api/users/{id}/reports` files one (201). Re-reporting the same member for the
  same category while it is still under review returns the existing report (200) instead of a
  duplicate. The limit is 20 reports a day. `GET /api/users/{id}/reports` lists your own reports and
  their status, without moderator notes.
- **Privacy:** a reported member is never told who reported them, and no member route lists reports
  made against anyone. Reporting doesn't block; blocking is a separate action.
- **Moderators:** `GET /api/moderation/reports` (filter by `status`, `category`, `reported_user_id`;
  each entry shows how many reports that member has), `GET` and `PATCH /api/moderation/reports/{id}`
  (`status` and an optional `note`). These need `Authorization: Bearer <MODERATION_TOKEN>`. Without
  that variable set, they refuse every request. Unreadable report files are listed under
  `unreadable`, never dropped.
- Reports are stored in `data/moderation/reports/`, which is git-ignored.

## Activity matching

Members who do the same activities are suggested to each other as possible workout partners: two
runners, two lifters (`backend/activity_matching/`). It's separate from Partner Hunt: no XP gate, no
city and no meeting preferences. The frontend doesn't show it yet.

- **Opt-in:** the `matching` consent (`POST /api/users/{id}/consents`). You only see others while
  you can be seen yourself. Members must be 18+ and have declared at least one activity (sign-up page 2).
- **Score (0–100):** shared activities 60%, weighted by both members' interest (1–5); fitness level
  20% (same, one apart, two apart); workout times 20%, used only when both share their habits.
  Scores are symmetric, and each match comes with plain-language reasons.
- **A match card shows only** first name and last initial, age band, fitness level, the shared
  activities, the score and the reasons. Never gender, body data, contact details, location or
  interest scores.
- **Blocking** uses the same list as Partner Hunt and works both ways. Anyone whose consent or
  block list can't be read is left out, never shown.

Routes: `GET /api/users/{id}/activity-matching` (status, and exactly what matches see),
`GET /api/users/{id}/activity-matches`, `POST /api/users/{id}/activity-matches/blocks`.

## Squirrel Social: accounts, Nearby Discovery, invite links

Phones find each other over Bluetooth and the backend decides when two people are really near each
other. The full design is in [`docs/nearby-discovery.md`](../docs/nearby-discovery.md); the phone
side is in [`mobile/nearby/`](../mobile/nearby/).

| Module | Routes |
|---|---|
| `backend/auth/` | `POST /api/auth/register`, `/login`, `/refresh`. Returns a short-lived access token (`Authorization: Bearer …`) and a single-use refresh token |
| `backend/nearby/` | `GET/PUT /api/nearby/settings`, `POST /api/proximity/session`, `/detection`, `/confirm`, `GET /api/nearby`, `POST /api/nearby/connect`, `GET /api/connections`, `POST /api/notifications/nearby` |
| `backend/deeplinks/` | `/join` and `/invite/{token}` (store redirect or landing page), `POST /api/invites`, `/join/qr.svg`, `/join/poster`, `/.well-known/*` |

- **Off by default.** Every proximity route answers 403 until the user turns Nearby on. Turning it off erases their proximity state at once.
- **No proximity history on disk.** Sightings and "who was near whom" live only in memory and expire after 15 minutes. On disk there is only the on/off setting (`nearby.json`) and accepted connections (`connections.json`), without time or place.
- **One process.** That in-memory state is why the server runs a single worker. A restart forgets it, and phones simply open a new session.
- **Accounts.** A registered account is an ordinary user folder (`data/users/<id>/profile.json`, same id format), so the rest of the API works for it. Credentials and refresh tokens are stored as hashes under `data/auth/`, which is private and git-ignored, like `data/invites/`.

## PostgreSQL: exercise sessions

With `DATABASE_URL` set, every exercise session is also written to PostgreSQL, one row per session
in `exercise_sessions` (`backend/db/`). It holds only the parameters that apply to the exercises
this backend coaches. Running measures (distance, steps, pace, speed) are left out on purpose, and
activity-specific parameters get their own migration when they're needed.

The same database can also hold the Run Module's tables (one Supabase + PostGIS database for both).
The two never read each other's tables. See "Both backends on one database" in the
[repository README](../README.md).

| Column | Meaning |
|---|---|
| `session_id` | The session's id (primary key) |
| `user_id` | The member's id (becomes the account service's UUID later) |
| `activity_type` | `squat`, `pushup`, `bicep_curl` or `high_knee` (references `activity_types`) |
| `start_time`, `end_time` | When the session was started, and when its last set finished |
| `duration_s` | Active exercise time across its sets, in seconds |
| `calories_kcal` | Empty until calories are calculated |
| `sets`, `reps` | Sets and reps completed (high knees: counted knee lifts) |
| `workout_score` | The system-generated Workout Score (0–100) |
| `activity_rating` | The member's own rating (1–5), if they gave one |

**When rows are written:**
- when a set finishes;
- when the training connection closes;
- when a rating is saved or removed;
- by `python -m backend.db backfill`, which writes every stored session.

A write is an upsert, so running it again just refreshes the row. The files on disk stay the source
of truth: if the database is down, training and ratings carry on, the failure is logged, and a
backfill catches the table up afterwards.

**Schema:** migrations live in `backend/db/migrations/` and are applied automatically when the app
starts. You can also apply them yourself with `python -m backend.db migrate`. `activity_types`
lists the enabled exercises; enabling a new exercise means adding its row in a new migration.

**Local setup (macOS):**

```bash
brew install postgresql@16 && brew services start postgresql@16
createdb exercise_mechanics
export DATABASE_URL=postgresql://localhost/exercise_mechanics
python -m uvicorn backend.main:app --port 8000     # creates the tables on start
python -m backend.db backfill                      # optional: copy existing sessions in
```

**On Render:** create a Render PostgreSQL database and set the web service's `DATABASE_URL` to its
*Internal Database URL*.

**Tests:** `backend/tests/test_database.py` runs against a real, disposable database named in
`TEST_DATABASE_URL` (its tables are dropped and recreated) and is skipped when that isn't set.

```bash
createdb exercise_test
TEST_DATABASE_URL=postgresql://localhost/exercise_test python -m pytest -q backend/tests
```

## Layout

| Path | What it holds |
|---|---|
| `backend/` | FastAPI app, exercise engine, per-exercise rule packages, scoring, tests |
| `frontend-react/` | React + Vite single-page app (source, assets, tests) |
| `frontend-dist/` | Generated SPA bundle — build output, not in version control |
| `data/users/` | Local per-user profiles and sessions, created at runtime (private, not shipped) |
| `Dockerfile` | Two-stage build: SPA + backend in one image, one origin |
| `USER_GUIDE.md` | Plain-language setup and usage walkthrough |
| `LICENSE` | MIT license terms |

## Data & privacy

Runtime profiles, sessions and raw captures are written under `data/users/<user-id>/` and are
**private local data** — they are excluded from version control and must not be shared publicly.
Make changes in the `backend/` and `frontend-react/` codebases only.

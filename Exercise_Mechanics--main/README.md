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
| Environment variables | none |
| Health check path (optional) | `/api/exercises` |

Nothing in `backend/` or `frontend-react/src/` reads an environment variable; the only one in play
is `PORT`, which the Dockerfile handles.

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

Onboarding (`POST /api/users`) accepts optional sign-up questions alongside the original fields,
and each one can be answered or changed later. The code is in `backend/profiles/`. The frontend
doesn't ask these questions yet; today's onboarding payload is still accepted unchanged.

| Question | Where it lives | Rule |
|---|---|---|
| Age | `profile.json` → `date_of_birth` | Only the date of birth is stored; age is always worked out from it |
| Gender | `profile.json` → `gender` | One of `female`, `male`, `non_binary`, `other`, `undisclosed` |
| Activities | `activities.json` | Codes from `GET /api/activity-types`; tracked exercises use their workout slugs |
| BMI | `measurements.json` (history) | Never stored: latest height × latest weight. `GET /api/users/{id}` returns the latest values |
| Fitness level, activity level, goal | `skill.json`, `fitness.json` | Fitness level *is* the dashboard skill level, with no second copy |
| Physique (body type, body fat, waist) | `physique.json`, `measurements.json` | **Needs `physique` consent** |
| Habits (workout times, sleep, diet, smoking, alcohol) | `habits.json` | **Needs `habits` consent** |

Consent is an append-only log (`consents.json`, `POST /api/users/{id}/consents`). Withdrawing it
erases that category's data. If the log can't be read, consent is treated as not given:
sensitive data is hidden and not saved, and the log is never overwritten. Sensitive questions
always offer a "prefer not to say" answer.

Routes: `GET /api/users/{id}/details` (everything, with age and BMI derived);
`PUT /api/users/{id}/details/{fitness|activities|physique|habits}`;
`GET|POST /api/users/{id}/measurements`; `GET|POST /api/users/{id}/consents`.

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

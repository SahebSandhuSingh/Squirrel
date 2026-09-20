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
the frontend static mount.

### First run — build before you serve

The build step above is not optional on a fresh clone. `frontend-dist/` is generated output and is
not in version control, but `backend/main.py` mounts it as static files at import time. Starting
uvicorn before the first `npm run build` therefore fails immediately with:

```
RuntimeError: Directory '.../frontend-dist' does not exist
```

Run `npm run build` in `frontend-react/` and start uvicorn again.

### High Knee

High Knee is enabled in the normal exercise catalog and uses the standard FastAPI launch command
shown above. No exercise-specific environment variable is required. After restarting the backend and
refreshing the browser, the High Knees card shows **Add to workout** while exercises that remain
planned stay unavailable.

For frontend development with Vite hot reload, keep FastAPI running and use a second terminal:

```bash
cd frontend-react
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` and `/ws` to FastAPI on
port 8000.

## Layout

| Path | What it holds |
|---|---|
| `backend/` | FastAPI app, exercise engine, per-exercise rule packages, scoring, tests |
| `frontend-react/` | React + Vite single-page app (source, assets, tests) |
| `data/users/` | Local per-user profiles and sessions, created at runtime (private, not shipped) |
| `USER_GUIDE.md` | Plain-language setup and usage walkthrough |
| `LICENSE` | MIT license terms |

## Data & privacy

Runtime profiles, sessions and raw captures are written under `data/users/<user-id>/` and are
**private local data** — they are excluded from version control and must not be shared publicly.
Make changes in the `backend/` and `frontend-react/` codebases only.

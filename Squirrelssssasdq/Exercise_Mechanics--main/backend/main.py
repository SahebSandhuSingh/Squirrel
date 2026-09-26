"""FitSync backend — restructured app.

The previous monolith is preserved as backend_old/ (reference only). The one-time A-pose
calibration has been dropped in favour of a per-set pre-check baseline (built in the engine/
and training/ layers). Today this serves the built SPA, user/session REST surfaces and the current
setup/training sockets; scoring, reporting and exercise breadth migrate in their own stages.

Layout:
    config.py    settings + per-user storage paths
    core/        generic primitives (landmarks, ids, keypoint helpers)
    engine/      exercise-agnostic infra (loader, scoring) — no rules, no FSM
    sessions/    minimal atomic session identity + plan persistence
    workouts/    validated lifecycle catalog + per-exercise config/FSM/rules
    training/    live setup-flow WS (/ws/setup) + baseline capture orchestration
    users/       user REST (create · profile · skill)
    auth/        Squirrel Social accounts (register · login · refresh) + bearer-token dependency
    nearby/      BLE nearby discovery: rotating ids, proximity scoring, nearby list, notifications
    deeplinks/   /join + /invite/{token} store routing, download QR, Universal/App Link files

Run from the project root:
    uvicorn backend.main:app --reload
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.auth.router import router as auth_router
from backend.deeplinks.router import router as deeplinks_router
from backend.engine.loader import validate_enabled_exercises
from backend.nearby.router import router as nearby_router
from backend.reports.router import router as reports_router
from backend.sessions.router import router as sessions_router
from backend.training.builders import validate_training_builders
from backend.training.router import router as setup_ws_router
from backend.users.router import router as users_router
from backend.workouts.catalog import load_catalog
from backend.workouts.router import router as workouts_router

# Planned entries validate lightweight metadata only. Enabled entries fully validate all four
# exercise config files before the application accepts traffic.
load_catalog()
validate_enabled_exercises()
validate_training_builders()

app = FastAPI(title="Exercise Mechanics")

# The UI is the Vite-built SPA in frontend-dist (run `npm run build` in frontend-react/).
_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = _ROOT / "frontend-dist"


@app.middleware("http")
async def _no_cache_html(request, call_next):
    """Never let the browser serve a STALE index.html — its inline CSS + hashed JS reference
    change every build, so the HTML entry point must revalidate (the /assets/* files, being
    content-hashed, stay cacheable). Same guard as the reference backend."""
    response = await call_next(request)
    if response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# API + WS routes are registered BEFORE the catch-all static mount so /api and /ws win.
app.include_router(users_router)
app.include_router(workouts_router)
app.include_router(sessions_router)
app.include_router(reports_router)
app.include_router(setup_ws_router)
app.include_router(auth_router)
app.include_router(nearby_router)
app.include_router(deeplinks_router)   # /join, /invite/*, /.well-known/* — must precede the SPA mount

# Mounted last so /ws + /api take precedence. html=True serves index.html at /.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

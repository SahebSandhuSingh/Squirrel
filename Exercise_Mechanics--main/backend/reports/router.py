"""Read-only analytics report routes — served from persisted session captures.

  • GET /api/users/{id}/progress                                  — cross-session trends
  • GET /api/users/{id}/activity/{year}                           — trained-on dates
  • GET /api/users/{id}/sessions                                  — session list (history)
  • GET /api/users/{id}/sessions/{sid}/overview                   — per-session header + cards
  • GET /api/users/{id}/sessions/{sid}/report                     — the session's exercise report
  • GET /api/users/{id}/sessions/{sid}/exercises/{ex}/report      — one exercise's report

Response shapes match frontend-react/src/flow/storage.ts. Session GET list lives here; session
creation (POST) stays in backend/sessions/router.py.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.core.ids import safe_user_id
from backend.reports import builder
from backend.sessions.store import is_valid_session_id

router = APIRouter(prefix="/api")


@router.get("/users/{user_id}/progress")
def get_progress(user_id: str) -> dict:
    return builder.build_progress(safe_user_id(user_id))


@router.get("/users/{user_id}/activity/{year}")
def get_activity(user_id: str, year: int) -> dict:
    return {"dates": builder.build_activity(safe_user_id(user_id), year)}


@router.get("/users/{user_id}/sessions")
def get_sessions(user_id: str) -> dict:
    return {"sessions": builder.list_sessions(safe_user_id(user_id))}


@router.get("/users/{user_id}/sessions/{session_id}/overview")
def get_overview(user_id: str, session_id: str) -> dict:
    if not is_valid_session_id(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    overview = builder.build_overview(safe_user_id(user_id), session_id)
    if overview is None:
        raise HTTPException(status_code=404, detail="session not found")
    return overview


@router.get("/users/{user_id}/sessions/{session_id}/report")
def get_session_report(user_id: str, session_id: str) -> dict:
    if not is_valid_session_id(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    report = builder.build_session_report(safe_user_id(user_id), session_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    return report


@router.get("/users/{user_id}/sessions/{session_id}/exercises/{exercise_id}/report")
def get_exercise_report(user_id: str, session_id: str, exercise_id: str) -> dict:
    if not is_valid_session_id(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    report = builder.build_exercise_report(safe_user_id(user_id), session_id, exercise_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    return report

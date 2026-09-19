"""FastAPI app exposing the live pose-recognition WebSocket.

    GET  /health                    liveness + active session count
    GET  /sessions                  per-session FPS/latency snapshot (ops view)
    WS   /ws/session                one workout session

Session handshake
-----------------
The exercise the user selected in the app is required before any frame is
processed, either as a query parameter (``/ws/session?exercise=pushup``) or as
the first text message (``{"type": "config", "exercise": "pushup"}``). Frames
sent before the exercise is known are refused rather than guessed at, because
every rule and confidence gate downstream is exercise-specific.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect, WebSocketState

from .config import (
    SESSION_IDLE_TIMEOUT_S,
    TARGET_MIN_FPS,
    WS_CLOSE_BAD_CONFIG,
)
from .schemas import EXERCISE_KEYS, ErrorMessage, SessionConfig
from .session import EstimatorFactory, WorkoutSession, default_estimator_factory
from .session_info import client_visible_config

logger = logging.getLogger(__name__)

__all__ = ["app", "create_app", "ACTIVE_SESSIONS"]

#: Live sessions by id. Entries are added when a session starts and removed in
#: the endpoint's ``finally``, so this dict cannot outgrow the connections.
ACTIVE_SESSIONS: Dict[str, WorkoutSession] = {}


def create_app(estimator_factory: EstimatorFactory = default_estimator_factory) -> FastAPI:
    """Build the app. ``estimator_factory`` is injectable for tests."""
    application = FastAPI(
        title="Squirrel pose recognition (live streaming)",
        version="0.1.0",
        summary=(
            "Step 1: live frame ingestion, BlazePose landmark extraction, "
            "side-on orientation validation, and rule-based classification of "
            "push-ups vs arm curls."
        ),
    )
    # Stored on app.state so tests can swap in a stub estimator per app instance.
    application.state.estimator_factory = estimator_factory

    @application.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "active_sessions": len(ACTIVE_SESSIONS),
            "supported_exercises": list(EXERCISE_KEYS),
            "target_min_fps": TARGET_MIN_FPS,
            "config": client_visible_config(),
        }

    @application.get("/sessions")
    async def sessions() -> dict:
        """Live performance view — the FPS/latency numbers per active session."""
        return {
            "active_sessions": [
                {
                    "session_id": session.session_id,
                    "exercise": session.selected_exercise,
                    **session.metrics.snapshot().__dict__,
                }
                for session in list(ACTIVE_SESSIONS.values())
            ]
        }

    @application.websocket("/ws/session")
    async def workout_session(websocket: WebSocket) -> None:
        await websocket.accept()
        config = await _negotiate_config(websocket)
        if config is None:
            return

        session = WorkoutSession(
            websocket=websocket,
            selected_exercise=config.exercise,
            estimator_factory=websocket.app.state.estimator_factory,
            client_session_id=config.client_session_id,
        )
        ACTIVE_SESSIONS[session.session_id] = session
        try:
            await session.run()
        finally:
            # Registry entry goes away with the connection: one session's state
            # never survives its socket.
            ACTIVE_SESSIONS.pop(session.session_id, None)

    return application


async def _negotiate_config(websocket: WebSocket) -> Optional[SessionConfig]:
    """Resolve the selected exercise, or refuse the connection.

    Accepts it as a query parameter (handy for the test client and for mobile
    clients that would rather not send a control frame) or as the first text
    message. Anything else is rejected with a fatal error message and a close
    code, never with a guessed exercise.
    """
    query_exercise = websocket.query_params.get("exercise")
    if query_exercise is not None:
        try:
            return SessionConfig(
                exercise=query_exercise,  # type: ignore[arg-type]
                client_session_id=websocket.query_params.get("client_session_id"),
            )
        except ValidationError:
            await _reject(
                websocket,
                "invalid_config",
                f"unsupported exercise {query_exercise!r}; expected one of "
                f"{list(EXERCISE_KEYS)}",
            )
            return None

    try:
        message = await asyncio.wait_for(
            websocket.receive(), timeout=SESSION_IDLE_TIMEOUT_S
        )
    except (asyncio.TimeoutError, WebSocketDisconnect):
        await _reject(
            websocket,
            "config_required",
            "no config message received; send {'type':'config','exercise':...} "
            "or pass ?exercise=",
        )
        return None

    if message.get("type") == "websocket.disconnect":
        return None
    if message.get("text") is None:
        await _reject(
            websocket,
            "config_required",
            "first message must be the config message, not a frame",
        )
        return None

    try:
        return SessionConfig.model_validate(json.loads(message["text"]))
    except (json.JSONDecodeError, ValidationError) as exc:
        await _reject(websocket, "invalid_config", f"invalid config message: {exc}")
        return None


async def _reject(websocket: WebSocket, reason: str, message: str) -> None:
    """Tell the client why, then close with the bad-config code."""
    logger.warning("rejecting session: %s (%s)", message, reason)
    with contextlib.suppress(Exception):
        if websocket.client_state is WebSocketState.CONNECTED:
            await websocket.send_text(
                ErrorMessage(
                    reason=reason,  # type: ignore[arg-type]
                    message=message,
                    fatal=True,
                ).model_dump_json()
            )
            await websocket.close(code=WS_CLOSE_BAD_CONFIG)


#: Module-level app for ``uvicorn pose_backend.server:app``.
app = create_app()

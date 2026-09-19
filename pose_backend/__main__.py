"""Run the pose-recognition WebSocket service.

    python -m pose_backend --host 0.0.0.0 --port 8000 --log-level info
    python -m pose_backend --log-level debug     # per-frame angles + latency

One uvicorn worker serves many concurrent sessions: each session does its
MediaPipe work on its own thread, so the event loop stays free to keep reading
frames (which is also what makes the backlog-drop policy meaningful).
"""

from __future__ import annotations

import argparse

import uvicorn

from .config import TARGET_MIN_FPS
from .logging_setup import configure_logging


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--log-level",
        default="info",
        choices=("debug", "info", "warning", "error"),
        help="debug logs every frame's joint angles and latency (tuning mode)",
    )
    args = parser.parse_args()

    configure_logging(args.log_level)
    print(
        f"pose backend on ws://{args.host}:{args.port}/ws/session?exercise=pushup "
        f"(target >= {TARGET_MIN_FPS:.0f} FPS per session)"
    )
    uvicorn.run(
        "pose_backend.server:app",
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        ws_max_size=8 * 1024 * 1024,
    )


if __name__ == "__main__":
    main()

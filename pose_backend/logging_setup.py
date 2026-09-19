"""Logging configuration shared by the server and the test client.

Per-frame angle/latency lines are logged at DEBUG (they are 15+ lines a second);
the periodic FPS summary is INFO, and a session missing the frame-rate target
is a WARNING. So ``--log-level info`` is the right setting for a running service
and ``--log-level debug`` is the one for tuning thresholds.
"""

from __future__ import annotations

import logging

__all__ = ["configure_logging"]

_FORMAT = "%(asctime)s %(levelname)-7s %(name)s | %(message)s"


def configure_logging(level: str = "info") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format=_FORMAT,
        datefmt="%H:%M:%S",
    )
    # MediaPipe/absl are chatty on stderr at import and per graph creation.
    logging.getLogger("absl").setLevel(logging.WARNING)

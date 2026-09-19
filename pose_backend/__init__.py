"""Squirrel exercise tracking — Step 1: live pose recognition backend.

Scope of this step (intentionally narrow):
    * ingest a live stream of JPEG frames over one WebSocket per workout session
    * extract the 33 BlazePose landmarks per frame
    * validate the setup every frame (full body, one person, confidence, and the
      mandatory SIDE-ON camera view)
    * extract only the joint angles each exercise needs
    * classify push-up vs arm curl with tunable, rule-based heuristics

Explicitly NOT in this step: rep counting, depth/range-of-motion scoring,
calorie estimation. The per-frame :class:`pose_backend.schemas.FrameResult` is
the interface those later modules consume.
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = ["__version__"]

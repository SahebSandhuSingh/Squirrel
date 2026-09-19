"""Streaming-safe landmark smoothing (incremental moving average).

Why it exists: raw BlazePose landmarks jitter by a few normalised units frame
to frame, and a joint angle is a *difference* of positions, so jitter is
amplified. Angles are therefore always computed from smoothed coordinates.

Why a moving average rather than a Kalman filter: with a 5-frame window at
15 FPS it removes essentially all the jitter that matters for angle bands while
staying trivially explainable and tunable (one constant), and it adds no motion
model that could lag a fast rep. The class is a drop-in seam if a Kalman filter
is wanted later — only ``update`` needs to change.

Streaming properties (required by this step):
    * O(window) work per frame, no lookahead, no full-video buffer.
    * One instance per session, owned by that session's state.
    * ``reset()`` clears all history so a session leaves nothing behind.
"""

from __future__ import annotations

from collections import deque
from typing import Deque, Optional

import numpy as np

from .config import (
    SMOOTHING_MAX_HELD_FRAMES,
    SMOOTHING_MAX_JUMP_PER_FRAME,
    SMOOTHING_VISIBILITY_WEIGHTED,
    SMOOTHING_WINDOW_FRAMES,
)
from .landmarks import LANDMARK_COUNT, VIS, X, Y, Z

__all__ = ["LandmarkSmoother"]

#: Floor on the per-landmark weight so a zero-visibility joint still
#: contributes a little instead of making the weighted mean undefined.
_MIN_WEIGHT = 1e-2


class LandmarkSmoother:
    """Rolling per-landmark moving average over the last N frames.

    Coordinates (x, y, z) are averaged; ``visibility`` is passed through from
    the newest frame unchanged, so a mid-session confidence drop is visible to
    validation on the very frame it happens rather than being averaged away.
    """

    __slots__ = (
        "_window",
        "_visibility_weighted",
        "_max_jump",
        "_buffer",
        "_last_raw",
        "_max_held",
        "_held_frames",
    )

    def __init__(
        self,
        window: int = SMOOTHING_WINDOW_FRAMES,
        visibility_weighted: bool = SMOOTHING_VISIBILITY_WEIGHTED,
        max_jump: float = SMOOTHING_MAX_JUMP_PER_FRAME,
        max_held_frames: int = SMOOTHING_MAX_HELD_FRAMES,
    ) -> None:
        if window < 1:
            raise ValueError("smoothing window must be >= 1 frame")
        self._window = window
        self._visibility_weighted = visibility_weighted
        self._max_jump = max_jump
        self._max_held = max_held_frames
        self._buffer: Deque[np.ndarray] = deque(maxlen=window)
        self._last_raw: Optional[np.ndarray] = None
        self._held_frames = np.zeros(LANDMARK_COUNT, dtype=np.int32)

    @property
    def filled(self) -> int:
        """How many frames of history are currently in the buffer."""
        return len(self._buffer)

    def update(self, array: np.ndarray) -> np.ndarray:
        """Push one raw (33, 4) frame and return the smoothed (33, 4) frame.

        The first frame of a session passes through unchanged (nothing to
        average with), which is intentional: feedback starts immediately and
        converges as the buffer fills.
        """
        if array.shape != (LANDMARK_COUNT, 4):
            raise ValueError(f"expected ({LANDMARK_COUNT}, 4) array, got {array.shape}")
        incoming = np.array(array, dtype=np.float32, copy=True)

        # Glitch guard: a joint that teleports between two OBSERVATIONS is a
        # tracking failure, not motion, so its last accepted position is carried
        # forward. Compared against the previous raw frame rather than the
        # smoothed one: the smoothed value lags by design, and measuring against
        # it would mistake fast honest movement for a glitch.
        if self._last_raw is not None and self._max_jump > 0:
            jumped = (
                np.hypot(
                    incoming[:, X] - self._last_raw[:, X],
                    incoming[:, Y] - self._last_raw[:, Y],
                )
                > self._max_jump
            )
            # A jump is only held while it looks momentary. Once a joint has been
            # held _max_held frames the new position is accepted: a lasting
            # displacement means the body actually moved there.
            hold = jumped & (self._held_frames < self._max_held)
            if hold.any():
                incoming[hold, X:Z + 1] = self._last_raw[hold, X:Z + 1]
            self._held_frames[hold] += 1
            self._held_frames[~hold] = 0

        self._buffer.append(incoming)
        self._last_raw = incoming
        smoothed = self._average()
        # Visibility is never smoothed — see class docstring.
        smoothed[:, VIS] = incoming[:, VIS]
        return smoothed

    def _average(self) -> np.ndarray:
        stack = np.stack(self._buffer)  # (frames, 33, 4)
        if stack.shape[0] == 1:
            return np.array(stack[0], dtype=np.float32, copy=True)
        if self._visibility_weighted:
            weights = np.maximum(stack[:, :, VIS], _MIN_WEIGHT)[:, :, None]
            coords = (stack[:, :, X:Z + 1] * weights).sum(axis=0) / weights.sum(axis=0)
        else:
            coords = stack[:, :, X:Z + 1].mean(axis=0)
        out = np.empty((LANDMARK_COUNT, 4), dtype=np.float32)
        out[:, X:Z + 1] = coords
        out[:, VIS] = stack[-1, :, VIS]
        return out

    def reset(self) -> None:
        """Drop all history (session teardown, or after a long detection gap)."""
        self._buffer.clear()
        self._last_raw = None
        self._held_frames[:] = 0

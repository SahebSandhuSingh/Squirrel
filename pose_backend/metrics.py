"""Per-session FPS and latency measurement.

Step 1 targets at least ``TARGET_MIN_FPS`` processed frames per second per
session. This module measures what is actually achieved, logs it periodically,
warns when the target is missed, and exposes the numbers on every frame
response so they can be inspected from the client while tuning.
"""

from __future__ import annotations

import logging
import statistics
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque

from .config import (
    FPS_WARN_MARGIN,
    METRICS_LOG_EVERY_N_FRAMES,
    METRICS_WINDOW_FRAMES,
    TARGET_MIN_FPS,
)

logger = logging.getLogger(__name__)

__all__ = ["SessionMetrics", "MetricsSnapshot"]


@dataclass(frozen=True)
class MetricsSnapshot:
    """Aggregate view of a session's performance."""

    frames_received: int
    frames_processed: int
    frames_dropped: int
    duration_s: float
    achieved_fps: float
    mean_latency_ms: float
    p95_latency_ms: float
    max_latency_ms: float
    mean_inference_ms: float
    mean_queue_wait_ms: float


class SessionMetrics:
    """Rolling-window FPS/latency tracker for one session."""

    __slots__ = (
        "session_id",
        "frames_received",
        "frames_processed",
        "frames_dropped",
        "_started_at",
        "_latencies",
        "_inference_ms",
        "_queue_waits",
        "_completion_times",
    )

    def __init__(self, session_id: str, window: int = METRICS_WINDOW_FRAMES) -> None:
        self.session_id = session_id
        self.frames_received = 0
        self.frames_processed = 0
        self.frames_dropped = 0
        self._started_at = time.perf_counter()
        self._latencies: Deque[float] = deque(maxlen=window)
        self._inference_ms: Deque[float] = deque(maxlen=window)
        self._queue_waits: Deque[float] = deque(maxlen=window)
        self._completion_times: Deque[float] = deque(maxlen=window)

    # -- counters -----------------------------------------------------------

    def note_received(self) -> None:
        self.frames_received += 1

    def note_dropped(self) -> None:
        """A queued frame was discarded because the backlog was full."""
        self.frames_dropped += 1

    def note_processed(
        self, latency_ms: float, inference_ms: float, queue_wait_ms: float
    ) -> None:
        self.frames_processed += 1
        self._latencies.append(latency_ms)
        self._inference_ms.append(inference_ms)
        self._queue_waits.append(queue_wait_ms)
        self._completion_times.append(time.perf_counter())

    # -- derived numbers ----------------------------------------------------

    @property
    def achieved_fps(self) -> float:
        """Processing rate over the rolling window (0.0 until 2 frames exist).

        Measured from frame-completion timestamps rather than
        frames / total_session_time, so a pause between sets does not make the
        pipeline look slow.
        """
        if len(self._completion_times) < 2:
            return 0.0
        span = self._completion_times[-1] - self._completion_times[0]
        if span <= 0:
            return 0.0
        return (len(self._completion_times) - 1) / span

    @property
    def elapsed_s(self) -> float:
        return time.perf_counter() - self._started_at

    def snapshot(self) -> MetricsSnapshot:
        return MetricsSnapshot(
            frames_received=self.frames_received,
            frames_processed=self.frames_processed,
            frames_dropped=self.frames_dropped,
            duration_s=round(self.elapsed_s, 3),
            achieved_fps=round(self.achieved_fps, 2),
            mean_latency_ms=_mean(self._latencies),
            p95_latency_ms=_percentile(self._latencies, 95),
            max_latency_ms=round(max(self._latencies), 2) if self._latencies else 0.0,
            mean_inference_ms=_mean(self._inference_ms),
            mean_queue_wait_ms=_mean(self._queue_waits),
        )

    # -- logging ------------------------------------------------------------

    def log_if_due(self) -> None:
        """Emit a metrics line every ``METRICS_LOG_EVERY_N_FRAMES`` frames.

        Logs a WARNING instead of INFO when the achieved rate is below the
        real-time target, since that is the number this step must hold.
        """
        if (
            self.frames_processed == 0
            or self.frames_processed % METRICS_LOG_EVERY_N_FRAMES != 0
        ):
            return
        snap = self.snapshot()
        below_target = snap.achieved_fps < (TARGET_MIN_FPS - FPS_WARN_MARGIN)
        logger.log(
            logging.WARNING if below_target else logging.INFO,
            "session=%s fps=%.1f%s latency_ms(mean=%.1f p95=%.1f max=%.1f) "
            "inference_ms=%.1f queue_wait_ms=%.1f frames(recv=%d proc=%d drop=%d)",
            self.session_id,
            snap.achieved_fps,
            f" BELOW TARGET {TARGET_MIN_FPS:.0f}" if below_target else "",
            snap.mean_latency_ms,
            snap.p95_latency_ms,
            snap.max_latency_ms,
            snap.mean_inference_ms,
            snap.mean_queue_wait_ms,
            snap.frames_received,
            snap.frames_processed,
            snap.frames_dropped,
        )


def _mean(values: Deque[float]) -> float:
    return round(statistics.fmean(values), 2) if values else 0.0


def _percentile(values: Deque[float], pct: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((pct / 100.0) * (len(ordered) - 1))))
    return round(ordered[index], 2)

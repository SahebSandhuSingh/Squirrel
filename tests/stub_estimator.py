"""A scripted pose estimator, so the streaming pipeline is testable with no I/O.

The pipeline talks to MediaPipe only through the ``PoseEstimator`` protocol, so
a test can hand it a fixed sequence of poses and assert on exactly what the
analysis chain does with them — no model download, no video file, no camera.
"""

from __future__ import annotations

from typing import List, Optional, Sequence

import numpy as np

from pose_backend.landmarks import PoseLandmarks
from pose_backend.pose_estimator import PoseInference


class StubEstimator:
    """Replays ``poses`` one per frame, cycling when it runs out."""

    def __init__(
        self,
        poses: Sequence[Optional[PoseLandmarks]],
        person_counts: Optional[Sequence[Optional[int]]] = None,
        inference_ms: float = 1.0,
        cycle: bool = True,
    ) -> None:
        self._poses = list(poses)
        self._person_counts = list(person_counts) if person_counts is not None else None
        self._inference_ms = inference_ms
        self._cycle = cycle
        self.calls = 0
        self.timestamps: List[int] = []
        self.closed = False

    def estimate(self, frame_bgr: np.ndarray, timestamp_ms: int) -> PoseInference:
        index = self.calls if not self._cycle else self.calls % len(self._poses)
        self.calls += 1
        self.timestamps.append(timestamp_ms)
        pose = self._poses[index] if index < len(self._poses) else None
        if self._person_counts is not None:
            count = self._person_counts[min(index, len(self._person_counts) - 1)]
        else:
            count = 0 if pose is None else 1
        return PoseInference(
            landmarks=pose, inference_ms=self._inference_ms, person_count=count
        )

    def close(self) -> None:
        self.closed = True

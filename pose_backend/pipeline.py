"""Per-frame processing core: bytes in, :class:`FrameResult` out.

Deliberately free of any transport concern — no WebSocket, no asyncio, no
queue. That is what makes the whole analysis path testable with synthetic
landmarks and no I/O (see tests/test_pipeline.py), and it keeps the session
layer (pose_backend/session.py) purely about streaming.

Order of operations per frame, and why:

    decode -> pose inference -> SMOOTH -> validate -> angles + classify

Smoothing sits before validation and angle extraction because every downstream
threshold (orientation ratios, joint angles, classification bands) should see
the same de-jittered coordinates. Validation sits before angle extraction
because an angle computed from untrustworthy landmarks is worse than no angle:
the rep counter downstream would happily count reps off it.

One instance per session, used from one thread.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional, Union

import numpy as np

from .classifier import ExerciseClassifier
from .config import INCLUDE_DEBUG_IN_RESPONSE, SMOOTHING_WINDOW_FRAMES
from .exercises import get_exercise
from .landmarks import PoseLandmarks
from .metrics import SessionMetrics
from .pose_estimator import PoseEstimator, decode_frame
from .schemas import ClassificationDebug, ErrorMessage, FrameMetrics, FrameResult
from .smoothing import LandmarkSmoother
from .validation import FrameValidator

logger = logging.getLogger(__name__)

__all__ = ["QueuedFrame", "FramePipeline"]

#: A frame as it arrives: JPEG bytes from the socket, or a decoded BGR array
#: (used by tests and by the video test client when it skips JPEG round-trips).
FramePayload = Union[bytes, np.ndarray]


@dataclass(frozen=True)
class QueuedFrame:
    """One ingested frame awaiting processing."""

    frame_number: int
    payload: FramePayload
    #: Unix epoch seconds when the frame was read off the socket (wire timebase).
    received_at: float
    #: ``time.perf_counter()`` at the same moment (monotonic, for latency maths).
    received_perf: float


class FramePipeline:
    """Runs one session's frames through the full analysis chain."""

    def __init__(
        self,
        session_id: str,
        selected_exercise: str,
        estimator: PoseEstimator,
        metrics: Optional[SessionMetrics] = None,
    ) -> None:
        self.session_id = session_id
        self.selected_exercise = selected_exercise
        self.exercise = get_exercise(selected_exercise)
        self._estimator = estimator
        self._smoother = LandmarkSmoother()
        self._validator = FrameValidator(self.exercise)
        self._classifier = ExerciseClassifier(selected_exercise)
        self.metrics = metrics or SessionMetrics(session_id)
        self._started_perf = time.perf_counter()
        self._consecutive_no_pose = 0

    # -- main entry point ---------------------------------------------------

    def process(self, frame: QueuedFrame) -> Union[FrameResult, ErrorMessage]:
        """Process one frame and build its response.

        Returns an :class:`ErrorMessage` only for problems that are not a
        per-frame validation outcome (an undecodable payload) — that keeps the
        ``validation_status`` enum exactly the set the app's UI switches on.
        """
        processing_started = time.perf_counter()
        queue_wait_ms = (processing_started - frame.received_perf) * 1000.0

        frame_bgr = self._as_frame(frame.payload)
        if frame_bgr is None:
            logger.warning(
                "session=%s frame=%d could not be decoded (%d bytes)",
                self.session_id,
                frame.frame_number,
                len(frame.payload) if isinstance(frame.payload, bytes) else -1,
            )
            return ErrorMessage(
                reason="frame_decode_failed",
                message="frame could not be decoded as an image",
                frame_number=frame.frame_number,
            )

        timestamp_ms = int((frame.received_perf - self._started_perf) * 1000.0)
        inference = self._estimator.estimate(frame_bgr, timestamp_ms)
        smoothed = self._smooth(inference.landmarks)

        side = smoothed.best_side() if smoothed is not None else "left"
        validation = self._validator.validate(
            smoothed, side, person_count=inference.person_count
        )

        angles: dict[str, float] = {}
        detected_exercise = "unrecognized"
        confidence = 0.0
        signals: dict[str, float] = {}
        scores: dict[str, float] = {}
        torso_angle: Optional[float] = None
        detail = validation.detail
        status = validation.status

        if validation.ok and smoothed is not None:
            classification = self._classifier.classify(smoothed)
            angles = classification.angles
            detected_exercise = classification.detected_exercise
            confidence = classification.confidence
            signals = classification.signals
            scores = classification.scores_by_exercise
            torso_angle = classification.torso_angle_from_horizontal_deg
            detail = classification.reason
            # A sustained run of unrecognized frames is reported as its own
            # status so the app can prompt a reposition / re-selection. The
            # angles stay in the payload: they were computed from a frame that
            # passed validation, and they are what makes the prompt debuggable.
            if self._classifier.needs_reposition_or_reselect:
                status = "needs_reposition_or_reselect"
        else:
            # Frame never reached the classifier — see note_unclassified_frame.
            self._classifier.note_unclassified_frame()

        processing_latency_ms = (time.perf_counter() - processing_started) * 1000.0
        self.metrics.note_processed(
            processing_latency_ms, inference.inference_ms, queue_wait_ms
        )
        self.metrics.log_if_due()
        self._log_frame(frame, status, detected_exercise, confidence, angles,
                        processing_latency_ms, queue_wait_ms)

        return FrameResult(
            timestamp=round(frame.received_at, 3),
            frame_number=frame.frame_number,
            landmarks=smoothed.to_json() if smoothed is not None else None,
            joint_angles=angles,
            detected_exercise=detected_exercise,  # type: ignore[arg-type]
            classification_confidence=confidence,
            validation_status=status,  # type: ignore[arg-type]
            selected_exercise=self.selected_exercise,  # type: ignore[arg-type]
            metrics=FrameMetrics(
                processing_latency_ms=round(processing_latency_ms, 2),
                inference_latency_ms=round(inference.inference_ms, 2),
                queue_wait_ms=round(queue_wait_ms, 2),
                end_to_end_latency_ms=round(queue_wait_ms + processing_latency_ms, 2),
                achieved_fps=round(self.metrics.achieved_fps, 2),
                dropped_frames=self.metrics.frames_dropped,
            ),
            debug=self._debug(
                side, torso_angle, signals, scores, validation, detail
            )
            if INCLUDE_DEBUG_IN_RESPONSE
            else None,
        )

    # -- steps --------------------------------------------------------------

    @staticmethod
    def _as_frame(payload: FramePayload) -> Optional[np.ndarray]:
        """Accept raw JPEG bytes (the wire format) or an already-decoded frame."""
        if isinstance(payload, np.ndarray):
            return payload
        return decode_frame(payload)

    def _smooth(self, landmarks: Optional[PoseLandmarks]) -> Optional[PoseLandmarks]:
        """Feed detected landmarks through the rolling average.

        A frame with no pose is NOT pushed into the buffer (averaging in a
        missing body would drag the smoothed skeleton toward nothing). After a
        gap longer than the window the history is dropped instead of being
        stitched across the gap — whatever the user did while untracked is not
        something to average over.
        """
        if landmarks is None:
            self._consecutive_no_pose += 1
            if self._consecutive_no_pose > SMOOTHING_WINDOW_FRAMES:
                self._smoother.reset()
            return None
        self._consecutive_no_pose = 0
        return landmarks.replace_array(self._smoother.update(landmarks.array))

    def _debug(
        self,
        side: str,
        torso_angle: Optional[float],
        signals: dict,
        scores: dict,
        validation,
        detail: Optional[str],
    ) -> ClassificationDebug:
        return ClassificationDebug(
            analysed_side=side,
            torso_angle_from_horizontal_deg=torso_angle,
            signals=signals,
            scores_by_exercise=scores,
            orientation=validation.orientation,
            min_key_joint_visibility=validation.min_key_joint_visibility,
            unrecognized_streak=self._classifier.unrecognized_streak,
            detail=detail,
        )

    def _log_frame(
        self,
        frame: QueuedFrame,
        status: str,
        detected: str,
        confidence: float,
        angles: dict,
        processing_latency_ms: float,
        queue_wait_ms: float,
    ) -> None:
        """Per-frame DEBUG line with the raw angles and latency, for tuning.

        DEBUG rather than INFO because it is one line per frame (15+/s); enable
        it with ``--log-level debug`` on the server while tuning thresholds.
        """
        if not logger.isEnabledFor(logging.DEBUG):
            return
        angle_text = " ".join(f"{name}={value:.1f}" for name, value in angles.items())
        logger.debug(
            "session=%s frame=%d status=%s detected=%s conf=%.2f %s "
            "proc_ms=%.1f queue_ms=%.1f",
            self.session_id,
            frame.frame_number,
            status,
            detected,
            confidence,
            angle_text or "angles=none",
            processing_latency_ms,
            queue_wait_ms,
        )

    # -- teardown -----------------------------------------------------------

    def close(self) -> None:
        """Release everything this pipeline holds (see session teardown)."""
        self._smoother.reset()
        self._validator.reset()
        self._classifier.reset()
        self._estimator.close()

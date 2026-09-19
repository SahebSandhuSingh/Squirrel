"""Frame decoding and MediaPipe Pose (BlazePose, 33 landmarks) inference.

Kept behind a narrow ``PoseEstimator`` protocol for two reasons: the pipeline
never depends on MediaPipe directly, and tests can drive the whole streaming
pipeline with synthetic landmarks (no video, no model, no socket) by injecting a
stub estimator.

MediaPipe API: this uses the current **Tasks** API
(``mediapipe.tasks.python.vision.PoseLandmarker``), which is what MediaPipe >= 1.0
ships; the older ``mp.solutions.pose`` API was removed there. Same BlazePose
model, same 33 landmarks, with two advantages that matter here:

  * ``RunningMode.VIDEO`` tracks between frames (needs monotonically increasing
    timestamps) instead of re-detecting each frame — faster and steadier, and
    the right mode for a live stream;
  * ``num_poses=2`` makes the pose model itself report a second person, which is
    where ``multiple_people_detected`` comes from. No separate people detector.

Threading: a ``PoseLandmarker`` holds per-instance tracking state and is NOT
thread-safe. Exactly one estimator per session, touched only from that session's
single worker thread. ``close()`` releases the native graph.
"""

from __future__ import annotations

import logging
import os
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Protocol, Tuple

import cv2
import numpy as np

from .config import (
    POSE_INFERENCE_MAX_EDGE_PX,
    POSE_MAX_POSES_DETECTED,
    POSE_MIN_DETECTION_CONFIDENCE,
    POSE_MIN_TRACKING_CONFIDENCE,
    POSE_MODEL_AUTO_DOWNLOAD,
    POSE_MODEL_BASE_URL,
    POSE_MODEL_DEFAULT_DIR,
    POSE_MODEL_DIR_ENV_VAR,
    POSE_MODEL_COMPLEXITY,
    POSE_MODEL_VARIANTS,
    POSE_STATIC_IMAGE_MODE,
    POSE_WARM_UP_ON_START,
)
from .landmarks import LANDMARK_COUNT, PoseLandmarks

logger = logging.getLogger(__name__)

__all__ = [
    "PoseEstimator",
    "PoseInference",
    "MediaPipePoseEstimator",
    "decode_frame",
    "resolve_model_path",
]


@dataclass(frozen=True)
class PoseInference:
    """One frame's inference output."""

    #: Landmarks of the PRIMARY (largest, i.e. nearest) pose, or None if no
    #: pose was found.
    landmarks: Optional[PoseLandmarks]
    #: Wall-clock milliseconds spent inside the pose model.
    inference_ms: float
    #: Poses found in the frame (after the background-pose size filter).
    #: ``None`` means this estimator cannot count people, in which case the
    #: multi-person check is skipped rather than guessed at.
    person_count: Optional[int] = None


_mediapipe_module = None


def _mediapipe():
    """Import MediaPipe on first use and cache the module.

    Lazy so that importing this package (for unit tests, or for a deployment
    that injects its own estimator) does not require the MediaPipe wheel.
    """
    global _mediapipe_module
    if _mediapipe_module is None:
        import mediapipe as mp

        _mediapipe_module = mp
    return _mediapipe_module


def decode_frame(payload: bytes) -> Optional[np.ndarray]:
    """Decode JPEG bytes from the socket into a BGR frame.

    Returns ``None`` for anything OpenCV cannot decode (truncated frame,
    non-image payload) — the caller reports ``frame_decode_failed`` rather than
    letting one bad frame kill the session.
    """
    buffer = np.frombuffer(payload, dtype=np.uint8)
    if buffer.size == 0:
        return None
    frame = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if frame is None or frame.size == 0:
        return None
    return frame


class PoseEstimator(Protocol):
    """What the pipeline needs from a pose backend."""

    def estimate(self, frame_bgr: np.ndarray, timestamp_ms: int) -> PoseInference:
        """Run pose inference on one BGR frame at ``timestamp_ms``."""
        ...

    def close(self) -> None:
        """Release any native resources held by the estimator."""
        ...


def resolve_model_path(model_complexity: int = POSE_MODEL_COMPLEXITY) -> Path:
    """Locate (and if allowed, fetch) the .task bundle for this complexity.

    Lookup order: ``$POSE_MODEL_DIR`` (or ``./models``) for a cached bundle,
    then download from ``POSE_MODEL_BASE_URL`` if ``POSE_MODEL_AUTO_DOWNLOAD``
    is on. Air-gapped deployments turn auto-download off and ship the file
    (see tools/fetch_model.py).
    """
    variant = POSE_MODEL_VARIANTS.get(model_complexity)
    if variant is None:
        raise ValueError(
            f"POSE_MODEL_COMPLEXITY must be one of {sorted(POSE_MODEL_VARIANTS)}, "
            f"got {model_complexity}"
        )
    directory = Path(os.environ.get(POSE_MODEL_DIR_ENV_VAR, POSE_MODEL_DEFAULT_DIR))
    path = directory / f"pose_landmarker_{variant}.task"
    if path.exists():
        return path
    if not POSE_MODEL_AUTO_DOWNLOAD:
        raise FileNotFoundError(
            f"pose model bundle not found at {path} and auto-download is off; "
            f"run tools/fetch_model.py or set {POSE_MODEL_DIR_ENV_VAR}"
        )
    url = POSE_MODEL_BASE_URL.format(variant=variant)
    directory.mkdir(parents=True, exist_ok=True)
    logger.info("downloading pose model %s -> %s", url, path)
    temporary = path.with_suffix(".task.part")
    urllib.request.urlretrieve(url, temporary)  # noqa: S310 - fixed, vendor URL
    temporary.replace(path)
    return path


class MediaPipePoseEstimator:
    """BlazePose (33 landmarks) via the MediaPipe Tasks PoseLandmarker."""

    __slots__ = ("_landmarker", "_max_edge", "_last_timestamp_ms")

    def __init__(
        self,
        model_complexity: int = POSE_MODEL_COMPLEXITY,
        max_edge_px: int = POSE_INFERENCE_MAX_EDGE_PX,
        max_poses: int = POSE_MAX_POSES_DETECTED,
        model_path: Optional[Path] = None,
    ) -> None:
        # Imported lazily so unit tests (and deployments injecting a different
        # estimator) do not need the MediaPipe wheel or the model bundle.
        _mediapipe()
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        self._max_edge = max_edge_px
        self._last_timestamp_ms = -1
        path = model_path or resolve_model_path(model_complexity)
        running_mode = (
            vision.RunningMode.IMAGE if POSE_STATIC_IMAGE_MODE else vision.RunningMode.VIDEO
        )
        options = vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(path)),
            running_mode=running_mode,
            num_poses=max_poses,
            min_pose_detection_confidence=POSE_MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=POSE_MIN_TRACKING_CONFIDENCE,
            output_segmentation_masks=False,
        )
        self._landmarker = vision.PoseLandmarker.create_from_options(options)
        warm_up_ms = self._warm_up() if POSE_WARM_UP_ON_START else 0.0
        logger.info(
            "PoseLandmarker ready (model=%s, mode=%s, num_poses=%d, max_edge=%dpx, "
            "warm_up=%.0fms)",
            path.name,
            running_mode.name,
            max_poses,
            max_edge_px,
            warm_up_ms,
        )

    def _warm_up(self) -> float:
        """Run one inference on a blank frame to pay the graph's start-up cost.

        Without this the first frame of a session takes several hundred
        milliseconds while TFLite initialises, which the user feels as the
        feedback "sticking" right when they start their first rep.
        """
        blank = np.zeros((256, 256, 3), dtype=np.uint8)
        started = time.perf_counter()
        try:
            self.estimate(blank, timestamp_ms=0)
        except Exception as exc:  # pragma: no cover - warm-up must never be fatal
            logger.warning("pose warm-up failed (continuing): %s", exc)
        return (time.perf_counter() - started) * 1000.0

    def estimate(self, frame_bgr: np.ndarray, timestamp_ms: int) -> PoseInference:
        """Run pose inference on one BGR frame.

        The frame is downscaled so its longest edge is at most
        ``POSE_INFERENCE_MAX_EDGE_PX``. Landmarks come back normalised to
        [0, 1], so downscaling changes no threshold in this package — the
        ORIGINAL frame dimensions are stored on the returned
        :class:`PoseLandmarks`, keeping the aspect correction for angles right.
        """
        height, width = frame_bgr.shape[:2]
        started = time.perf_counter()
        inference_frame = _limit_edge(frame_bgr, self._max_edge)
        rgb = cv2.cvtColor(inference_frame, cv2.COLOR_BGR2RGB)
        mp = _mediapipe()
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # VIDEO mode requires strictly increasing timestamps. Two frames can
        # share a millisecond on a fast stream, so nudge rather than fail.
        stamp = max(timestamp_ms, self._last_timestamp_ms + 1)
        self._last_timestamp_ms = stamp

        if POSE_STATIC_IMAGE_MODE:
            result = self._landmarker.detect(mp_image)
        else:
            result = self._landmarker.detect_for_video(mp_image, stamp)
        inference_ms = (time.perf_counter() - started) * 1000.0

        poses = list(result.pose_landmarks or [])
        if not poses:
            return PoseInference(None, inference_ms, person_count=0)

        primary_index, person_count = _select_primary_pose(poses)
        return PoseInference(
            landmarks=_to_pose_landmarks(poses[primary_index], width, height),
            inference_ms=inference_ms,
            person_count=person_count,
        )

    def close(self) -> None:
        try:
            self._landmarker.close()
        except Exception as exc:  # pragma: no cover - defensive teardown
            logger.warning("error closing PoseLandmarker: %s", exc)



def _to_pose_landmarks(pose, width: int, height: int) -> PoseLandmarks:
    """Convert one Tasks-API pose (list of NormalizedLandmark) to our container."""
    array = np.empty((LANDMARK_COUNT, 4), dtype=np.float32)
    for i, lm in enumerate(pose[:LANDMARK_COUNT]):
        # Tasks landmarks expose visibility and presence; visibility is the
        # "is this joint unoccluded" score the validation thresholds refer to.
        visibility = lm.visibility if lm.visibility is not None else 0.0
        array[i] = (lm.x, lm.y, lm.z, visibility)
    return PoseLandmarks(array, width, height)


def _select_primary_pose(poses: List) -> Tuple[int, int]:
    """Pick the nearest (largest bounding box) pose and count relevant people.

    The primary pose is the one the workout is about: with two people in frame
    the exerciser is the one closest to the camera. Poses much smaller than the
    primary are treated as background and excluded from the count, so a person
    walking past at the far end of a gym does not stop the session.
    """
    from .config import MULTI_PERSON_MIN_RELATIVE_SIZE

    areas = [_bbox_area(pose) for pose in poses]
    primary_index = max(range(len(areas)), key=lambda i: areas[i])
    primary_area = areas[primary_index] or 1e-9
    relevant = sum(
        1 for area in areas if area / primary_area >= MULTI_PERSON_MIN_RELATIVE_SIZE
    )
    return primary_index, relevant


def _bbox_area(pose) -> float:
    """Normalised bounding-box area of one pose (proxy for nearness)."""
    xs = [lm.x for lm in pose]
    ys = [lm.y for lm in pose]
    return max(0.0, (max(xs) - min(xs))) * max(0.0, (max(ys) - min(ys)))


def _limit_edge(frame_bgr: np.ndarray, max_edge: int) -> np.ndarray:
    """Proportionally downscale so the longest edge is <= ``max_edge``."""
    height, width = frame_bgr.shape[:2]
    longest = max(height, width)
    if longest <= max_edge:
        return frame_bgr
    scale = max_edge / float(longest)
    return cv2.resize(
        frame_bgr,
        (max(1, int(round(width * scale))), max(1, int(round(height * scale)))),
        interpolation=cv2.INTER_AREA,
    )

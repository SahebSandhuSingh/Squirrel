"""Wire contract between the mobile app, this service, and the next module.

This is the whole public interface of Step 1. The rep-counting module (Step 2)
consumes :class:`FrameResult` in real time, so it is fully typed and every
field is documented here rather than in prose elsewhere.

Message flow over one WebSocket connection (= one workout session):

    app  -> server : {"type": "config", "exercise": "pushup"}   (first message)
    server -> app  : {"type": "session_ready", ...}
    app  -> server : <JPEG bytes>            (binary, one message per frame)
    server -> app  : FrameResult JSON        (one per PROCESSED frame)
    app  -> server : {"type": "ping"} | {"type": "stop"}        (optional)
    server -> app  : {"type": "error", ...}  (non-frame problems, e.g. bad JPEG)
    server -> app  : {"type": "session_closed", ...} (final metrics summary)

Note that frames the server drops because of backlog produce no FrameResult;
``frame_number`` is assigned at ingestion, so gaps in the sequence are exactly
the dropped frames.
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

__all__ = [
    "ExerciseKey",
    "ValidationStatus",
    "EXERCISE_KEYS",
    "VALIDATION_STATUSES",
    "SessionConfig",
    "FrameResult",
    "FrameMetrics",
    "ClassificationDebug",
    "SessionReady",
    "ErrorMessage",
    "SessionClosed",
]

#: What the classifier may report. "unrecognized" means the frame's angles are
#: not consistent with the exercise the app selected.
ExerciseKey = Literal["pushup", "arm_curl", "unrecognized"]

#: Per-frame validation outcome. "ok" is the only value for which
#: ``joint_angles`` is populated and the classifier has run.
ValidationStatus = Literal[
    "ok",
    "low_confidence",
    "body_not_fully_visible",
    "multiple_people_detected",
    "wrong_orientation_needs_side_view",
    "needs_reposition_or_reselect",
]

#: Exercises the app may select (no "unrecognized" — that is output-only).
EXERCISE_KEYS: tuple[str, ...] = ("pushup", "arm_curl")

VALIDATION_STATUSES: tuple[str, ...] = (
    "ok",
    "low_confidence",
    "body_not_fully_visible",
    "multiple_people_detected",
    "wrong_orientation_needs_side_view",
    "needs_reposition_or_reselect",
)


class SessionConfig(BaseModel):
    """First message of a session: which exercise the user selected in the app.

    The backend trusts this selection and validates consistency against it
    (the classifier confirms the selected exercise or reports "unrecognized");
    it does not silently switch to the other exercise.
    """

    type: Literal["config"] = "config"
    exercise: Literal["pushup", "arm_curl"]
    #: Optional app-side identifier echoed back in logs, for correlating with
    #: mobile-side telemetry. Never used for auth.
    client_session_id: Optional[str] = None


class FrameMetrics(BaseModel):
    """Per-frame performance numbers (also written to the session log).

    Present on every FrameResult so FPS/latency can be inspected from the
    client side while tuning, without parsing server logs.
    """

    #: Wall-clock ms of actual processing: decode + pose inference + smoothing
    #: + angle extraction + classification. Excludes queue time, so it measures
    #: the pipeline rather than the backlog.
    processing_latency_ms: float
    #: Of which, MediaPipe Pose inference.
    inference_latency_ms: float
    #: Ms the frame spent waiting in the backlog queue before processing.
    queue_wait_ms: float
    #: queue_wait_ms + processing_latency_ms: age of the result when it is sent,
    #: i.e. the number the feedback UX actually feels.
    end_to_end_latency_ms: float
    #: Processing rate over the session's rolling metrics window.
    achieved_fps: float
    #: Frames dropped so far this session because the backlog was full.
    dropped_frames: int


class ClassificationDebug(BaseModel):
    """Raw rule inputs, for threshold tuning. Ignorable by consumers."""

    #: Body side the angles were taken from ("left" / "right").
    analysed_side: str
    #: Angle of the shoulder->hip line vs image horizontal (0 = lying flat,
    #: 90 = upright). The primary push-up vs arm-curl discriminator.
    torso_angle_from_horizontal_deg: Optional[float] = None
    #: Per-signal satisfaction in [0, 1] for the selected exercise's rules.
    signals: Dict[str, float] = Field(default_factory=dict)
    #: Score of every exercise's rule set, whether selected or not — shows how
    #: close the other exercise was, useful when an exercise is misread.
    scores_by_exercise: Dict[str, float] = Field(default_factory=dict)
    #: Orientation-check measurements (shoulder/hip spread ratios).
    orientation: Dict[str, float] = Field(default_factory=dict)
    #: Lowest visibility among the key joints for the selected exercise.
    min_key_joint_visibility: Optional[float] = None
    #: Consecutive "unrecognized" frames at this point in the session.
    unrecognized_streak: int = 0
    #: Extra machine-readable detail for a failed frame, e.g. "no_pose_detected".
    detail: Optional[str] = None


class FrameResult(BaseModel):
    """Result for ONE processed frame. This is the Step 2 input contract.

    Ordering guarantee: results are sent in ascending ``frame_number`` order.
    Missing numbers are frames dropped by the backlog policy.
    """

    type: Literal["frame_result"] = "frame_result"

    #: Unix epoch seconds (float, ms resolution) at which the frame was read
    #: off the socket — the closest available proxy for capture time and the
    #: timebase Step 2 should use for rep timing.
    timestamp: float
    #: Monotonic per-session counter, starting at 1, assigned at ingestion.
    frame_number: int

    #: All 33 smoothed BlazePose landmarks (normalised x/y, MediaPipe z,
    #: visibility). ``None`` when no pose was detected in the frame.
    landmarks: Optional[List[dict]] = None

    #: Only the angles relevant to the exercise under evaluation, in degrees.
    #: Push-ups:  {"elbow_angle_deg", "body_line_angle_deg"}
    #: Arm curls: {"elbow_angle_deg", "elbow_drift_angle_deg"}
    #: Empty when ``validation_status != "ok"`` (angles are deliberately NOT
    #: computed for a frame that failed validation).
    joint_angles: Dict[str, float] = Field(default_factory=dict)

    #: "pushup" | "arm_curl" | "unrecognized".
    detected_exercise: ExerciseKey = "unrecognized"

    #: [0, 1] weighted rule score for the selected exercise's rules. When
    #: ``detected_exercise`` is "unrecognized" this is the sub-threshold score
    #: (how close the frame came), not zero. 0.0 when validation failed and the
    #: classifier never ran.
    classification_confidence: float = 0.0

    #: See :data:`ValidationStatus`.
    validation_status: ValidationStatus = "ok"

    #: Exercise the app selected for this session (echoed for traceability).
    selected_exercise: Literal["pushup", "arm_curl"]

    metrics: Optional[FrameMetrics] = None
    debug: Optional[ClassificationDebug] = None


class SessionReady(BaseModel):
    """Sent once, after a valid config message, before frames are accepted."""

    type: Literal["session_ready"] = "session_ready"
    session_id: str
    exercise: Literal["pushup", "arm_curl"]
    #: Human-readable camera-setup instruction for this exercise, so the app
    #: shows the same requirement the backend enforces.
    required_camera_view: str
    #: Thresholds in force, echoed so client-side tuning stays in sync.
    config: Dict[str, float]


class ErrorMessage(BaseModel):
    """A problem that is not a per-frame validation outcome.

    Kept separate from ``FrameResult.validation_status`` so that enum stays
    exactly the set the app's UI switches on.
    """

    type: Literal["error"] = "error"
    reason: Literal[
        "frame_decode_failed",
        "frame_too_large",
        "invalid_config",
        "config_required",
        "unsupported_message",
        "internal_error",
    ]
    message: str
    frame_number: Optional[int] = None
    fatal: bool = False


class SessionClosed(BaseModel):
    """Final summary, best-effort on clean shutdown."""

    type: Literal["session_closed"] = "session_closed"
    session_id: str
    reason: str
    frames_received: int
    frames_processed: int
    frames_dropped: int
    duration_s: float
    achieved_fps: float
    mean_latency_ms: float
    p95_latency_ms: float

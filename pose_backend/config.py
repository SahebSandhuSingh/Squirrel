"""Central tuning surface for the pose-recognition backend (Step 1).

EVERY threshold used anywhere in this package is declared here and nowhere
else, so tuning never requires hunting through modules. Modules import these
constants by name at the top of the file; no module re-defines a magic number.

Grouped as:
    1. Transport / streaming
    2. MediaPipe Pose
    3. Smoothing
    4. Landmark confidence + frame validation
    5. Camera-orientation (side-on) validation
    6. Exercise classification (shared)
    7. Per-exercise rule thresholds
    8. Performance / logging

Coordinate conventions assumed by every threshold below:
    * Landmark x, y are MediaPipe-normalised to [0, 1] (x by frame width,
      y by frame height) and y grows DOWNWARD (image convention).
    * Angle maths runs in "aspect-corrected" space (x multiplied by
      width / height) so a 45 degree limb is 45 degrees regardless of the
      frame's aspect ratio. See pose_backend.landmarks.PoseLandmarks.
    * Angles are degrees. Joint angles are the interior angle at the middle
      joint, in [0, 180].
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# 1. Transport / streaming
# ---------------------------------------------------------------------------

#: Max frames allowed to sit in a session's backlog queue. When a frame arrives
#: and the queue is full, the OLDEST queued frame is dropped (never the new one,
#: never an unbounded queue) so the pipeline always works on fresh frames.
FRAME_QUEUE_MAX_SIZE: int = 2

#: Reject absurd payloads early (a 1080p JPEG at q80 is well under 1 MB).
MAX_FRAME_BYTES: int = 4 * 1024 * 1024

#: Seconds a session may sit with no frame at all before it is closed as dead.
SESSION_IDLE_TIMEOUT_S: float = 30.0

#: WebSocket close codes used by this service (4xxx = application-defined).
WS_CLOSE_BAD_CONFIG: int = 4400
WS_CLOSE_IDLE_TIMEOUT: int = 4408
WS_CLOSE_INTERNAL_ERROR: int = 4500

# ---------------------------------------------------------------------------
# 2. MediaPipe Pose (BlazePose, 33 landmarks)
# ---------------------------------------------------------------------------

#: 0 = Lite (fastest), 1 = Full (default: good accuracy, hits >=15 FPS on CPU),
#: 2 = Heavy (most accurate, usually <15 FPS CPU-only).
POSE_MODEL_COMPLEXITY: int = 1

#: False = video/stream mode: MediaPipe tracks between frames instead of
#: re-detecting from scratch. Must stay False for a live stream.
POSE_STATIC_IMAGE_MODE: bool = False

#: MediaPipe's own internal detection/tracking gates (separate from this
#: package's per-joint confidence gate in section 4).
POSE_MIN_DETECTION_CONFIDENCE: float = 0.5
POSE_MIN_TRACKING_CONFIDENCE: float = 0.5

#: Segmentation masks are not needed at this step; enabling costs latency.
POSE_ENABLE_SEGMENTATION: bool = False

#: Longest frame edge fed to MediaPipe. Frames larger than this are
#: proportionally downscaled before inference (landmarks come back
#: normalised, so downscaling does not change any threshold below).
POSE_INFERENCE_MAX_EDGE_PX: int = 640

#: Run one throwaway inference when a session's estimator is created, so the
#: first REAL frame is not ~20x slower than the rest (the TFLite delegate and the
#: graph warm up on first use). Costs a few hundred ms at session setup, before
#: the client is told the session is ready.
POSE_WARM_UP_ON_START: bool = True

#: Max poses the landmarker looks for. 2 is deliberate and is the whole
#: mechanism behind "multiple_people_detected": we only need to know whether a
#: SECOND person is in frame, and asking for more costs extra inference.
POSE_MAX_POSES_DETECTED: int = 2

#: MediaPipe Tasks model asset. model_complexity -> bundled model variant.
POSE_MODEL_VARIANTS: dict[int, str] = {0: "lite", 1: "full", 2: "heavy"}

#: Where .task model bundles are cached. Override with the POSE_MODEL_DIR env
#: var (e.g. a baked-in path or a mounted volume in production).
POSE_MODEL_DIR_ENV_VAR: str = "POSE_MODEL_DIR"
POSE_MODEL_DEFAULT_DIR: str = "models"

#: Download the model bundle on first use if it is not in the cache dir.
#: Set False for air-gapped deployments and ship the .task file instead
#: (see tools/fetch_model.py).
POSE_MODEL_AUTO_DOWNLOAD: bool = True
POSE_MODEL_BASE_URL: str = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_{variant}/float16/latest/pose_landmarker_{variant}.task"
)

# ---------------------------------------------------------------------------
# 3. Smoothing (streaming-safe, incremental)
# ---------------------------------------------------------------------------

#: Number of most-recent frames in the per-session rolling moving-average
#: buffer applied to raw landmark coordinates BEFORE angles are computed.
#: Larger = smoother but more lag (at 15 FPS, 5 frames ~= 330 ms of history).
SMOOTHING_WINDOW_FRAMES: int = 5

#: Weight landmarks by visibility inside the moving average, so a briefly
#: mis-tracked joint contributes less than a confidently tracked one.
SMOOTHING_VISIBILITY_WEIGHTED: bool = True

#: A joint that moves further than this (normalised units) between two
#: consecutive observations is treated as a tracking glitch, and its previous
#: position is carried forward for that joint only.
SMOOTHING_MAX_JUMP_PER_FRAME: float = 0.35

#: ... but only for this many consecutive frames. A jump that PERSISTS is not a
#: glitch: the user repositioned, or tracking re-locked onto the body from a new
#: angle. Without this cap a joint could be held at a stale position forever.
SMOOTHING_MAX_HELD_FRAMES: int = 3

# ---------------------------------------------------------------------------
# 4. Landmark confidence + frame validation
# ---------------------------------------------------------------------------

#: Minimum MediaPipe visibility for the key joints of the exercise being
#: evaluated. Below this for ANY key joint -> "low_confidence", angles are NOT
#: computed for that frame.
MIN_KEY_JOINT_VISIBILITY: float = 0.6

#: Normalised slack allowed outside [0, 1] before a landmark counts as out of
#: frame. MediaPipe extrapolates slightly past the frame edge, so a tiny
#: tolerance avoids false "body_not_fully_visible" at the edges.
#:
#: Note on the division of labour between the two checks (they must not
#: overlap, or the user gets told to fix the wrong thing):
#:   * "body_not_fully_visible" is purely about FRAMING — a body region whose
#:     landmarks all fall outside the frame. Fix: step back / re-aim the camera.
#:   * "low_confidence" is purely about TRACKING QUALITY — a key joint of the
#:     selected exercise below MIN_KEY_JOINT_VISIBILITY. Fix: better light,
#:     less occlusion, plainer clothing.
#: Every landmark is covered by exactly one of them: key joints by confidence,
#: everything else by framing.
FRAME_BOUNDS_TOLERANCE: float = 0.03

#: Second-person detection. MediaPipe's pose landmarker is asked for up to
#: POSE_MAX_POSES_DETECTED poses per frame (see section 2), so the person count
#: comes straight from the pose model on every frame — no separate detector, no
#: sampling cadence. This is the number of consecutive frames with >1 pose
#: required before the session reports it, so one noisy frame (a reflection, a
#: bystander crossing the edge of frame) does not interrupt a set.
MULTI_PERSON_CONSECUTIVE_HITS: int = 3

#: Consecutive single-pose frames before the "multiple people" flag clears.
MULTI_PERSON_CLEAR_FRAMES: int = 3

#: A second pose whose bounding box is smaller than this fraction of the
#: primary pose's box is ignored: someone far in the background is not the
#: problem this check exists for (a second person inside the workout frame is).
MULTI_PERSON_MIN_RELATIVE_SIZE: float = 0.35

#: Order in which failing checks are reported when more than one fails.
#: Earlier = higher priority. Kept as data so it is tunable, not buried in
#: control flow.
VALIDATION_PRIORITY: tuple[str, ...] = (
    "multiple_people_detected",
    "body_not_fully_visible",
    "low_confidence",
    "wrong_orientation_needs_side_view",
)

# ---------------------------------------------------------------------------
# 5. Camera-orientation (side-on) validation
# ---------------------------------------------------------------------------
# BOTH exercises require a SIDE-ON view. In a side view the left and right
# shoulders (and hips) sit almost on top of each other in the image, so their
# horizontal separation is small relative to torso length. Front-on, that
# separation is large. Ratios are normalised by torso length so they are
# invariant to how far the user stands from the camera.

#: max |x_left_shoulder - x_right_shoulder| / torso_length for "side-on".
SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO: float = 0.38
#: max |x_left_hip - x_right_hip| / torso_length for "side-on".
SIDE_VIEW_HIP_SPREAD_MAX_RATIO: float = 0.34

#: Hysteresis, so a single noisy frame does not spam "reposition":
#: this many consecutive front-on frames before the status flips to
#: wrong_orientation_needs_side_view ...
ORIENTATION_BAD_FRAMES_TO_FLAG: int = 3
#: ... and this many consecutive good frames before it clears again.
ORIENTATION_GOOD_FRAMES_TO_CLEAR: int = 2

#: Torso shorter than this (aspect-corrected normalised units) means the user
#: is too far away / badly cropped for the ratios above to mean anything.
ORIENTATION_MIN_TORSO_LENGTH: float = 0.08

# ---------------------------------------------------------------------------
# 6. Exercise classification (shared, rule-based)
# ---------------------------------------------------------------------------

#: A weighted signal score >= this confirms the exercise; below it the frame is
#: reported as "unrecognized".
#: Chosen against the observed spread: a frame of the RIGHT exercise scores
#: ~0.8-1.0 (and >=0.8 even with sloppy form or a tilted camera), while a frame
#: of the WRONG exercise cannot exceed ~0.55, because the torso-orientation
#: signal — the discriminator, and the heaviest weight in both rule sets — reads
#: zero. 0.65 sits in that gap with margin on both sides.
CLASSIFICATION_MIN_SCORE: float = 0.65

#: Consecutive "unrecognized" frames before session state becomes
#: "needs_reposition_or_reselect" (sent back immediately on the frame that
#: crosses the limit).
UNRECOGNIZED_FRAME_LIMIT: int = 10

#: Soft-margin width (degrees) used by the ramp helpers: a signal scores 1.0
#: inside its band, decays linearly to 0.0 across this margin outside it.
#: Soft edges keep classification stable at the boundary of a rep.
SIGNAL_SOFT_MARGIN_DEG: float = 15.0

# ---------------------------------------------------------------------------
# 7. Per-exercise rule thresholds  (side-on camera view assumed throughout)
# ---------------------------------------------------------------------------

# --- Push-ups --------------------------------------------------------------
# Primary discriminator: torso is near HORIZONTAL in a push-up.
#: Max angle between the shoulder->hip line and the image horizontal.
PUSHUP_TORSO_MAX_DEG_FROM_HORIZONTAL: float = 35.0
#: Loose band for the shoulder-hip-ankle body line during CLASSIFICATION only.
#: Form grading (sagging / piked hips) is a later step and must not make a
#: sloppy push-up "unrecognized" here.
PUSHUP_BODY_LINE_MIN_DEG: float = 130.0
#: Hands are on the floor, so the wrist sits below the shoulder in image
#: space by at least this much (normalised y, +ve = lower in frame).
PUSHUP_MIN_WRIST_BELOW_SHOULDER: float = 0.02
#: Signal weights (must sum to 1.0).
PUSHUP_SIGNAL_WEIGHTS: dict[str, float] = {
    "torso_horizontal": 0.50,
    "body_line_straightish": 0.25,
    "wrist_below_shoulder": 0.25,
}

# --- Arm curls -------------------------------------------------------------
# Primary discriminator: torso is near VERTICAL (standing) in an arm curl.
#: Min angle between the shoulder->hip line and the image horizontal.
ARM_CURL_TORSO_MIN_DEG_FROM_HORIZONTAL: float = 60.0
#: Max shoulder-hip-elbow angle (vertex = hip) for an elbow still tucked
#: against the torso. Larger means the elbow has drifted forward/outward.
ARM_CURL_ELBOW_DRIFT_MAX_DEG: float = 40.0
#: Plausible elbow-bend window across a curl (fully extended ~170,
#: fully flexed ~30). Outside this window the arm is doing something else.
ARM_CURL_ELBOW_ANGLE_MIN_DEG: float = 20.0
ARM_CURL_ELBOW_ANGLE_MAX_DEG: float = 178.0
#: Signal weights (must sum to 1.0).
ARM_CURL_SIGNAL_WEIGHTS: dict[str, float] = {
    "torso_upright": 0.45,
    "elbow_tucked_to_torso": 0.30,
    "elbow_angle_in_curl_range": 0.25,
}

# ---------------------------------------------------------------------------
# 8. Performance / logging
# ---------------------------------------------------------------------------

#: Processing-rate target per session for near-real-time feedback.
TARGET_MIN_FPS: float = 15.0

#: Rolling window (frames) over which achieved FPS and latency are measured.
METRICS_WINDOW_FRAMES: int = 45

#: Emit a metrics log line every N processed frames.
METRICS_LOG_EVERY_N_FRAMES: int = 30

#: Log a warning when achieved FPS over the rolling window falls below
#: TARGET_MIN_FPS by more than this margin (avoids warning on tiny dips).
FPS_WARN_MARGIN: float = 1.0

#: Include the raw per-signal diagnostics in each frame response. Useful while
#: tuning thresholds; the rep-counting module ignores the extra key.
INCLUDE_DEBUG_IN_RESPONSE: bool = True

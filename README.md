# Squirrel — Pose Recognition Backend (Step 1)

Live, camera-based exercise tracking backend. This step builds the **pose
detection and exercise classification foundation** only: a mobile app streams
camera frames over a WebSocket, and for every frame this service returns the 33
BlazePose landmarks, the joint angles that matter for the exercise, a validation
verdict on the camera setup, and a rule-based classification.

Exercises monitored: **push-ups** and **arm curls**. Both require a **side-on
camera view**, which this service actively validates rather than assumes.

## What is and is not in this step

In scope:

- live frame ingestion over WebSocket (one connection = one workout session)
- JPEG decode → MediaPipe Pose → 33 landmarks per frame
- backlog control: drop the oldest queued frame rather than process stale ones
- per-frame setup validation (full body, one person, joint confidence, side-on view)
- per-exercise joint-angle extraction (only the angles each exercise needs)
- rule-based, tunable classification of push-up vs arm curl
- streaming-safe landmark smoothing, FPS/latency measurement, session teardown

Deliberately **not** in this step (later modules consume this one's output):
rep counting, depth / range-of-motion scoring, calorie estimation. No trained
classifier — classification is explainable heuristics over joint angles. No
batch or uploaded-video processing — the model is a live session throughout.
Squats are not part of this build.

## Layout

```
pose_backend/
  config.py          ALL tunable thresholds, grouped and documented. Start here.
  server.py          FastAPI app: /health, /sessions, WS /ws/session
  session.py         One WebSocket = one session: backlog queue, worker, teardown
  pipeline.py        Per-frame chain: decode → pose → smooth → validate → classify
  pose_estimator.py  MediaPipe Tasks PoseLandmarker wrapper + JPEG decode
  smoothing.py       Incremental moving average over a rolling per-session buffer
  validation.py      Setup checks, including the side-on orientation check
  classifier.py      Rule-based classification + "unrecognized" streak state
  exercises/
    base.py          Shared scaffolding; the torso-orientation discriminator
    pushup.py        Camera assumption, 2 angles, 3 weighted signals
    arm_curl.py      Camera assumption, 2 angles, 3 weighted signals
  landmarks.py       BlazePose indices, landmark container, aspect correction
  geometry.py        Pure angle maths and soft-threshold ramps (no dependencies)
  metrics.py         Per-session FPS and latency tracking + periodic logging
  schemas.py         The typed wire contract (this is the Step 2 interface)
tests/               141 tests; no camera, video, model or network needed
tools/
  test_client.py     Streams a video file over the socket at a realistic FPS
  make_sample_video.py  Builds a test video from a still photo of a person
  fetch_model.py     Pre-downloads the MediaPipe model bundle
```

## Camera requirement (enforced, not assumed)

Both exercises need a **side-on** view, and the check runs on **every frame**,
not just at setup, because users drift out of position mid-set.

| Exercise | Why side-on |
|---|---|
| Push-ups | Elbow bend and body alignment (sagging / piked hips) are sagittal-plane quantities. Front-on, the forearm points at the camera and hip deviation hides behind the torso. |
| Arm curls | Elbow bend is only cleanly measurable in profile, and elbow drift away from the torso is invisible front-on. The app instructs the user to turn to their side first. |

How it is detected: seen from the side, the left and right shoulders sit almost
on top of each other in the image, so their horizontal separation is small
relative to torso length; front-on it is close to full shoulder width. The
ratios are normalised by torso length, so the verdict does not change with
distance from the camera. Both shoulders and hips are checked, with hysteresis
(`ORIENTATION_BAD_FRAMES_TO_FLAG` / `..._GOOD_FRAMES_TO_CLEAR`) so one noisy
frame neither prompts nor clears a reposition.

## Joint angles measured

Only what each exercise needs — not all 33 landmarks. Angles are the interior
angle at the middle joint, in degrees, computed from **smoothed** coordinates in
aspect-corrected space (so a 16:9 stream and a 4:3 stream measure the same body
identically).

**Push-ups** (`pose_backend/exercises/pushup.py`)

| Angle | Joints (vertex) | Reads |
|---|---|---|
| `elbow_angle_deg` | shoulder–**elbow**–wrist | ~180 locked out, smaller = deeper |
| `body_line_angle_deg` | shoulder–**hip**–ankle | ~180 straight plank; lower = sagging or piked |

**Arm curls** (`pose_backend/exercises/arm_curl.py`)

| Angle | Joints (vertex) | Reads |
|---|---|---|
| `elbow_angle_deg` | shoulder–**elbow**–wrist | ~170 extended, ~30 fully curled |
| `elbow_drift_angle_deg` | shoulder–**hip**–elbow | small = elbow tucked; larger = drifting forward (momentum cue) |

## Classification

Rule-based and explainable, never a black box. The primary discriminator is
**torso orientation relative to gravity**: the shoulder→hip line is near
horizontal in a push-up and near vertical in an arm curl. Each exercise adds two
supporting signals, each soft-thresholded (graded, not boolean, so verdicts do
not flicker at a band edge) and individually weighted:

| Exercise | Signals (weight) |
|---|---|
| Push-up | `torso_horizontal` (0.50), `body_line_straightish` (0.25), `wrist_below_shoulder` (0.25) |
| Arm curl | `torso_upright` (0.45), `elbow_tucked_to_torso` (0.30), `elbow_angle_in_curl_range` (0.25) |

The app sends the exercise the user selected when the session opens. The backend
**trusts that selection and validates consistency against it**: it confirms the
selected exercise when its score clears `CLASSIFICATION_MIN_SCORE`, otherwise it
reports `unrecognized` — it never silently switches the user to the other
exercise. The other exercise's score is still computed and returned under
`debug.scores_by_exercise`, which is what reveals a user who picked wrong.

Observed spread: a frame of the *right* exercise scores 0.80–1.00 (still ≥0.80
with sloppy form or a tilted camera), while a frame of the *wrong* exercise
cannot exceed ~0.55, because the heavily weighted torso signal reads zero. The
0.65 threshold sits in that gap.

After `UNRECOGNIZED_FRAME_LIMIT` consecutive unrecognized frames, the session
state becomes `needs_reposition_or_reselect` and is sent back immediately on the
frame that crosses the limit.

## Protocol

```
app    → server : {"type":"config","exercise":"pushup"}    first message …
                  … or connect to /ws/session?exercise=pushup
server → app    : {"type":"session_ready", …}              camera instruction + thresholds
app    → server : <JPEG bytes>                             binary, one per frame
server → app    : {"type":"frame_result", …}               one per PROCESSED frame
app    → server : {"type":"ping"} | {"type":"stop"}        optional
server → app    : {"type":"error", …}                      non-frame problems
server → app    : {"type":"session_closed", …}             final metrics summary
```

**The app should wait for `session_ready` before sending its first frame.** The
backend builds the session's pose graph during the handshake (a few hundred
milliseconds, including a warm-up inference so the first real frame is not ~20x
slower than the rest); frames pushed into that window only sit in the backlog and
get dropped as stale. `tools/test_client.py` waits, and streams 100% of frames as
a result.

Frames sent before the exercise is known are refused, not guessed at. The
exercise cannot be changed mid-session (that would invalidate the smoothing
buffer and every streak counter) — the app opens a new session instead.

### Per-frame response

```jsonc
{
  "type": "frame_result",
  "timestamp": 1789797707.842,      // epoch seconds, when the frame was read off the socket
  "frame_number": 41,               // assigned at ingestion; GAPS = frames dropped as stale
  "landmarks": [                    // all 33, smoothed; null if no pose was found
    {"index": 0, "name": "nose", "x": 0.46, "y": 0.43, "z": -0.19, "visibility": 0.99}
  ],
  "joint_angles": {                 // only the exercise's angles; {} if validation failed
    "elbow_angle_deg": 92.4,
    "body_line_angle_deg": 171.8
  },
  "detected_exercise": "pushup",    // "pushup" | "arm_curl" | "unrecognized"
  "classification_confidence": 0.94,
  "validation_status": "ok",        // see below
  "selected_exercise": "pushup",

  "metrics": {                      // performance, per frame
    "processing_latency_ms": 29.7, "inference_latency_ms": 27.0,
    "queue_wait_ms": 0.2, "end_to_end_latency_ms": 29.9,
    "achieved_fps": 32.8, "dropped_frames": 0
  },
  "debug": {                        // rule inputs, for tuning; ignorable downstream
    "analysed_side": "left", "torso_angle_from_horizontal_deg": 5.2,
    "signals": {"torso_horizontal": 1.0, "body_line_straightish": 1.0,
                "wrist_below_shoulder": 1.0},
    "scores_by_exercise": {"pushup": 1.0, "arm_curl": 0.55},
    "orientation": {"shoulder_spread_ratio": 0.09, "hip_spread_ratio": 0.08,
                    "torso_length": 0.22, "shoulder_spread_limit": 0.38,
                    "hip_spread_limit": 0.34},
    "min_key_joint_visibility": 0.95, "unrecognized_streak": 0, "detail": null
  }
}
```

`validation_status` is one of:

| Status | Meaning | Angles computed? |
|---|---|---|
| `ok` | frame usable, classification ran | yes |
| `low_confidence` | a key joint below `MIN_KEY_JOINT_VISIBILITY` | no |
| `body_not_fully_visible` | a body region is outside the frame (or no pose at all) | no |
| `multiple_people_detected` | more than one person in frame | no |
| `wrong_orientation_needs_side_view` | camera is front-on; prompt the user to turn | no |
| `needs_reposition_or_reselect` | sustained `unrecognized`; prompt reposition or re-selection | yes |

Angles are withheld whenever a check fails: an angle derived from unreliable or
wrongly projected landmarks is worse than no angle, because the rep counter
downstream would happily count reps off it.

Non-frame problems arrive as `{"type":"error","reason":…}` —
`frame_decode_failed`, `frame_too_large`, `invalid_config`, `config_required`,
`unsupported_message`, `internal_error` — keeping `validation_status` exactly the
set the app's UI switches on. A single undecodable frame does not end a session.

## Streaming behaviour

- **One session per connection.** Everything stateful (backlog queue, smoothing
  buffer, hysteresis counters, unrecognized streak, MediaPipe graph, metrics) is
  created with the socket and released in the session's `finally`.
- **Backlog: drop the oldest.** At most `FRAME_QUEUE_MAX_SIZE` frames wait for
  processing. When a frame arrives and the queue is full, the oldest queued frame
  is discarded — on a live stream a 300 ms-old frame is worth nothing, and an
  unbounded queue turns a slow moment into permanently growing latency. Dropped
  frames produce no response, so gaps in `frame_number` are exactly the drops.
- **One worker thread per session.** A MediaPipe landmarker is stateful and not
  thread-safe; it is created and used on that one thread and closed on it too.
  The event loop therefore never blocks on inference and keeps reading frames.
- **Disconnects.** Client disconnect, network drop, idle timeout, server
  shutdown and unexpected exceptions all converge on the same teardown: cancel
  the worker, drain the queue, close MediaPipe, release the thread, deregister
  the session. Teardown does its releasing with synchronous calls first, because
  it usually runs while the task is already cancelled and any `await` would raise
  immediately at that point. `SESSION_IDLE_TIMEOUT_S` catches a client that
  vanishes without a close frame (a backgrounded app) and closes with code 4408.

## Tuning

Every threshold lives in `pose_backend/config.py`, grouped by concern, each with
a comment on what it does and why its value was chosen. Nothing is hardcoded
elsewhere. The values in force are also sent to the client in `session_ready`,
so both sides can agree on the rules.

| Group | Key constants |
|---|---|
| Streaming | `FRAME_QUEUE_MAX_SIZE`, `MAX_FRAME_BYTES`, `SESSION_IDLE_TIMEOUT_S` |
| MediaPipe | `POSE_MODEL_COMPLEXITY` (0 lite / 1 full / 2 heavy), `POSE_INFERENCE_MAX_EDGE_PX`, `POSE_MAX_POSES_DETECTED`, `POSE_WARM_UP_ON_START` |
| Smoothing | `SMOOTHING_WINDOW_FRAMES`, `SMOOTHING_VISIBILITY_WEIGHTED`, `SMOOTHING_MAX_JUMP_PER_FRAME`, `SMOOTHING_MAX_HELD_FRAMES` |
| Confidence / framing | `MIN_KEY_JOINT_VISIBILITY`, `FRAME_BOUNDS_TOLERANCE`, `VALIDATION_PRIORITY` |
| Multiple people | `MULTI_PERSON_CONSECUTIVE_HITS`, `MULTI_PERSON_CLEAR_FRAMES`, `MULTI_PERSON_MIN_RELATIVE_SIZE` |
| Orientation | `SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO`, `SIDE_VIEW_HIP_SPREAD_MAX_RATIO`, `ORIENTATION_BAD_FRAMES_TO_FLAG`, `ORIENTATION_GOOD_FRAMES_TO_CLEAR`, `ORIENTATION_MIN_TORSO_LENGTH` |
| Classification | `CLASSIFICATION_MIN_SCORE`, `UNRECOGNIZED_FRAME_LIMIT`, `SIGNAL_SOFT_MARGIN_DEG` |
| Per exercise | `PUSHUP_*`, `ARM_CURL_*` (angle bands and signal weights) |
| Performance | `TARGET_MIN_FPS`, `METRICS_WINDOW_FRAMES`, `METRICS_LOG_EVERY_N_FRAMES` |

To tune against real footage: run the test client with `--csv angles.csv`, then
inspect the raw per-frame angles, orientation ratios, signal satisfactions and
latencies it records.

## Running it

```bash
# 1. System library MediaPipe >= 1.0 needs, even CPU-only:
sudo apt-get install -y libegl1 libgles2

# 2. Python dependencies
pip install -r requirements.txt

# 3. Model bundle (or let the first session download it automatically)
python tools/fetch_model.py

# 4. Run
python -m pose_backend --host 0.0.0.0 --port 8000
python -m pose_backend --log-level debug     # + per-frame angles and latency
```

`GET /health` reports liveness, active session count and the thresholds in
force. `GET /sessions` reports live per-session FPS and latency.

## Testing

```bash
pip install -r requirements-dev.txt
pytest                                    # 141 tests, ~1s, no camera/model/network
```

The suite runs the whole analysis chain — and the real WebSocket app — against
hand-built synthetic skeletons (`tests/synthetic_poses.py`) and a scripted
estimator (`tests/stub_estimator.py`), so angle maths, validation, classification
and session lifecycle are all testable without video or sockets, per
`tests/test_pipeline.py` and `tests/test_streaming_session.py`.

To exercise the live path against a real stream:

```bash
# a sample video from a still photo (MediaPipe needs a real body, not a stick figure)
python tools/make_sample_video.py --download --out sample.mp4

# stream it as a paced 15 FPS session, logging angles and latency for tuning
python tools/test_client.py --source sample.mp4 --exercise arm_curl --csv angles.csv

# a real webcam, with a per-frame line printed
python tools/test_client.py --source 0 --exercise arm_curl --show-frames

# deliberately overfeed the backend to see the drop-oldest policy work
python tools/test_client.py --source sample.mp4 --exercise pushup --fps 60
```

The client paces frames like a camera and does **not** slow down when the
backend falls behind, which is what makes the backlog policy observable.

### Measured on a CPU-only container (MediaPipe `full`, 720×1280 input)

| | |
|---|---|
| Pose inference | ~28 ms/frame |
| Total processing latency | mean 32 ms, p95 37 ms |
| Processing capacity | ~32 frames/s per session (target ≥ 15) |
| Paced 15 FPS run, 240 frames | 240 processed, 0 dropped; round trip mean 35 ms, max 54 ms |
| Overfed 60 FPS run, 240 frames | 124 processed, 113 dropped; queue wait steady ~26 ms and end-to-end latency flat at ~57 ms — bounded, not growing |

Note the two runs together: overfeeding the backend costs frames, as intended,
but not latency. That is the point of dropping the oldest frame instead of
queueing it.

## Known limitations

- **A single frame cannot tell "standing at rest" from the bottom of a curl.**
  They are geometrically identical: arm extended, torso upright, elbow tucked. So
  a side-on standing user in an arm-curl session classifies as `arm_curl`. Telling
  rest from work requires movement over time, which is the rep-counting step's job.
- **Multiple-person detection comes from the pose model** (`num_poses=2`), so it
  inherits the model's judgement: someone mostly out of frame, or much smaller
  than the exerciser (`MULTI_PERSON_MIN_RELATIVE_SIZE`), is treated as background.
- **Recovery after a teleport-like reposition costs a few frames**
  (`SMOOTHING_MAX_HELD_FRAMES + SMOOTHING_WINDOW_FRAMES`, ~0.5 s at 15 FPS) while
  the smoothing buffer refills. Real users move gradually, so this is the worst case.
- **MediaPipe's `z` is returned but never used** for angles: monocular depth is
  too noisy to threshold on. All angle maths is 2D in the image plane, which is
  exactly why the side-on view is mandatory.
- **Classification is per-frame and stateless apart from the unrecognized
  streak.** No temporal model, by design at this step.

## For the next step (rep counting)

Consume `FrameResult` (`pose_backend/schemas.py`). Per frame you get a monotonic
`frame_number`, a `timestamp` to use as the rep-timing timebase, the smoothed
landmarks, the exercise's angles, the classification, and a `validation_status`
saying whether the angles are trustworthy. Only act on frames with
`validation_status == "ok"` and a `detected_exercise` that is not
`unrecognized`; treat a gap in `frame_number` as a dropped frame rather than a
pause in the movement.

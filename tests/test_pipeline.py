"""End-to-end analysis chain on synthetic frames — no socket, no video, no model.

Covers the whole per-frame contract: which statuses come out, when angles are
and are not computed, and that the response matches the documented schema.
"""

from __future__ import annotations

import time

import cv2
import pytest

from pose_backend.config import (
    ORIENTATION_BAD_FRAMES_TO_FLAG,
    SMOOTHING_MAX_HELD_FRAMES,
    SMOOTHING_WINDOW_FRAMES,
    UNRECOGNIZED_FRAME_LIMIT,
)
from pose_backend.landmarks import LANDMARK_COUNT
from pose_backend.pipeline import FramePipeline, QueuedFrame
from pose_backend.schemas import ErrorMessage, FrameResult, VALIDATION_STATUSES
from stub_estimator import StubEstimator
from synthetic_poses import (
    arm_curl_flexed,
    cropped_feet_pose,
    front_on_standing,
    jpeg_like_frame,
    low_confidence_pose,
    pushup_bottom,
    pushup_top,
)


def make_frame(number: int = 1, payload=None) -> QueuedFrame:
    return QueuedFrame(
        frame_number=number,
        payload=jpeg_like_frame() if payload is None else payload,
        received_at=time.time(),
        received_perf=time.perf_counter(),
    )


def pipeline_for(exercise: str, poses, **kwargs) -> FramePipeline:
    return FramePipeline(
        session_id="test",
        selected_exercise=exercise,
        estimator=StubEstimator(poses, **kwargs),
    )


class TestHappyPath:
    def test_pushup_frame_produces_a_full_result(self):
        pipeline = pipeline_for("pushup", [pushup_top()])
        result = pipeline.process(make_frame(7))

        assert isinstance(result, FrameResult)
        assert result.frame_number == 7
        assert result.validation_status == "ok"
        assert result.detected_exercise == "pushup"
        assert result.classification_confidence >= 0.65
        assert result.selected_exercise == "pushup"
        assert set(result.joint_angles) == {"elbow_angle_deg", "body_line_angle_deg"}

    def test_all_33_landmarks_are_returned(self):
        pipeline = pipeline_for("arm_curl", [arm_curl_flexed()])
        result = pipeline.process(make_frame())
        assert result.landmarks is not None
        assert len(result.landmarks) == LANDMARK_COUNT
        first = result.landmarks[0]
        assert set(first) == {"index", "name", "x", "y", "z", "visibility"}
        assert first["name"] == "nose"

    def test_metrics_are_attached_to_every_frame(self):
        pipeline = pipeline_for("pushup", [pushup_top()])
        result = pipeline.process(make_frame())
        assert result.metrics is not None
        assert result.metrics.processing_latency_ms >= 0.0
        assert result.metrics.end_to_end_latency_ms >= result.metrics.processing_latency_ms
        assert result.metrics.dropped_frames == 0

    def test_debug_block_explains_the_verdict(self):
        pipeline = pipeline_for("pushup", [pushup_top()])
        result = pipeline.process(make_frame())
        assert result.debug is not None
        assert result.debug.analysed_side in ("left", "right")
        assert result.debug.torso_angle_from_horizontal_deg < 35.0
        assert set(result.debug.scores_by_exercise) == {"pushup", "arm_curl"}
        assert result.debug.orientation["shoulder_spread_ratio"] < 0.38

    def test_timestamp_and_frame_number_are_passed_through(self):
        pipeline = pipeline_for("pushup", [pushup_top()])
        frame = make_frame(42)
        result = pipeline.process(frame)
        assert result.frame_number == 42
        assert result.timestamp == pytest.approx(frame.received_at, abs=0.01)

    def test_real_jpeg_bytes_are_decoded(self):
        _, encoded = cv2.imencode(".jpg", jpeg_like_frame())
        pipeline = pipeline_for("pushup", [pushup_top()])
        result = pipeline.process(make_frame(payload=encoded.tobytes()))
        assert isinstance(result, FrameResult)
        assert result.validation_status == "ok"

    def test_statuses_stay_within_the_documented_enum(self):
        poses = [pushup_top(), None, low_confidence_pose(), front_on_standing()]
        pipeline = pipeline_for("pushup", poses)
        for number in range(1, 20):
            result = pipeline.process(make_frame(number))
            if isinstance(result, FrameResult):
                assert result.validation_status in VALIDATION_STATUSES


class TestValidationFailuresSkipAngles:
    @pytest.mark.parametrize(
        "poses, expected_status, frames",
        [
            ([None], "body_not_fully_visible", 1),
            ([cropped_feet_pose()], "body_not_fully_visible", 1),
            ([low_confidence_pose()], "low_confidence", 1),
            (
                [front_on_standing()],
                "wrong_orientation_needs_side_view",
                ORIENTATION_BAD_FRAMES_TO_FLAG,
            ),
        ],
    )
    def test_no_angles_are_computed(self, poses, expected_status, frames):
        """A frame that failed validation must not hand angles downstream."""
        pipeline = pipeline_for("arm_curl", poses)
        for number in range(1, frames + 1):
            result = pipeline.process(make_frame(number))
        assert result.validation_status == expected_status
        assert result.joint_angles == {}
        assert result.detected_exercise == "unrecognized"
        assert result.classification_confidence == 0.0

    def test_missing_pose_returns_no_landmarks(self):
        pipeline = pipeline_for("pushup", [None])
        result = pipeline.process(make_frame())
        assert result.landmarks is None
        assert result.debug.detail == "no_pose_detected"

    def test_multiple_people_is_reported(self):
        pipeline = pipeline_for(
            "arm_curl", [arm_curl_flexed()], person_counts=[2]
        )
        for number in range(1, 5):
            result = pipeline.process(make_frame(number))
        assert result.validation_status == "multiple_people_detected"
        assert result.joint_angles == {}

    def test_undecodable_payload_is_an_error_not_a_validation_status(self):
        pipeline = pipeline_for("pushup", [pushup_top()])
        result = pipeline.process(make_frame(3, payload=b"this is not a jpeg"))
        assert isinstance(result, ErrorMessage)
        assert result.reason == "frame_decode_failed"
        assert result.frame_number == 3
        assert not result.fatal, "one bad frame must not end the session"


class TestRepositionPrompt:
    def test_sustained_wrong_exercise_asks_for_reposition_or_reselect(self):
        """Ten consecutive unrecognized frames must flip the session state."""
        pipeline = pipeline_for("pushup", [arm_curl_flexed()])
        statuses = [
            pipeline.process(make_frame(n)).validation_status
            for n in range(1, UNRECOGNIZED_FRAME_LIMIT + 1)
        ]
        assert statuses[:-1] == ["ok"] * (UNRECOGNIZED_FRAME_LIMIT - 1)
        assert statuses[-1] == "needs_reposition_or_reselect"

    def test_reposition_prompt_keeps_the_angles_for_debugging(self):
        pipeline = pipeline_for("pushup", [arm_curl_flexed()])
        for number in range(1, UNRECOGNIZED_FRAME_LIMIT + 1):
            result = pipeline.process(make_frame(number))
        assert result.validation_status == "needs_reposition_or_reselect"
        assert result.joint_angles != {}
        assert result.debug.unrecognized_streak == UNRECOGNIZED_FRAME_LIMIT

    def test_getting_into_position_clears_the_prompt(self):
        """Recovery costs a few frames: the smoothing buffer still holds the old
        pose, so the prompt clears once the average has caught up rather than on
        the very first correct frame. Pinned here so the lag stays bounded by the
        smoothing window."""
        # Worst case: an instant teleport between poses, where the glitch guard
        # holds joints briefly and the moving average then has to refill.
        recovery_frames = SMOOTHING_MAX_HELD_FRAMES + SMOOTHING_WINDOW_FRAMES + 1
        pipeline = pipeline_for(
            "pushup",
            [arm_curl_flexed()] * UNRECOGNIZED_FRAME_LIMIT
            + [pushup_bottom()] * recovery_frames,
            cycle=False,
        )
        for number in range(1, UNRECOGNIZED_FRAME_LIMIT + 1):
            flagged = pipeline.process(make_frame(number))
        assert flagged.validation_status == "needs_reposition_or_reselect"

        recovered = [
            pipeline.process(make_frame(UNRECOGNIZED_FRAME_LIMIT + n))
            for n in range(1, recovery_frames + 1)
        ]
        assert recovered[-1].validation_status == "ok"
        assert recovered[-1].detected_exercise == "pushup"

    def test_invalid_frames_do_not_trigger_the_prompt(self):
        """Low-confidence frames report their own reason, not 'reselect'."""
        pipeline = pipeline_for("pushup", [low_confidence_pose()])
        for number in range(1, UNRECOGNIZED_FRAME_LIMIT * 3):
            result = pipeline.process(make_frame(number))
        assert result.validation_status == "low_confidence"


class TestStreamingBehaviour:
    def test_timestamps_handed_to_the_model_increase(self):
        """MediaPipe's video mode rejects non-increasing timestamps."""
        estimator = StubEstimator([pushup_top()])
        pipeline = FramePipeline("test", "pushup", estimator)
        for number in range(1, 6):
            pipeline.process(make_frame(number))
        assert estimator.timestamps == sorted(estimator.timestamps)

    def test_smoothing_history_is_dropped_after_a_long_detection_gap(self):
        """Do not average across a gap where the user was untracked."""
        poses = [pushup_top()] + [None] * 10 + [pushup_bottom()]
        pipeline = pipeline_for("pushup", poses, cycle=False)
        results = [pipeline.process(make_frame(n)) for n in range(1, len(poses) + 1)]
        # The frame after the gap reflects the new pose alone: a bent elbow,
        # not a blend with the locked-out arm from before the gap.
        elbow = results[-1].joint_angles["elbow_angle_deg"]
        straight_elbow = results[0].joint_angles["elbow_angle_deg"]
        assert straight_elbow > 165.0
        assert elbow < 110.0, "post-gap frame must not be blended with the old pose"

    def test_achieved_fps_is_measured(self):
        pipeline = pipeline_for("pushup", [pushup_top()])
        for number in range(1, 12):
            pipeline.process(make_frame(number))
        assert pipeline.metrics.achieved_fps > 0.0
        assert pipeline.metrics.frames_processed == 11

    def test_close_releases_the_estimator(self):
        estimator = StubEstimator([pushup_top()])
        pipeline = FramePipeline("test", "pushup", estimator)
        pipeline.process(make_frame())
        pipeline.close()
        assert estimator.closed

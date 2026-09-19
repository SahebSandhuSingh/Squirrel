"""Frame validation: full body, one person, confidence, and the side-on check."""

from __future__ import annotations


from pose_backend.config import (
    MULTI_PERSON_CLEAR_FRAMES,
    MULTI_PERSON_CONSECUTIVE_HITS,
    ORIENTATION_BAD_FRAMES_TO_FLAG,
    ORIENTATION_GOOD_FRAMES_TO_CLEAR,
    SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO,
)
from pose_backend.exercises import ARM_CURL, PUSHUP
from pose_backend.validation import FrameValidator, MultiPersonGate, check_orientation
from synthetic_poses import (
    arm_curl_flexed,
    cropped_feet_pose,
    front_on_standing,
    low_confidence_pose,
    pushup_top,
)


class TestOrientationCheck:
    def test_side_on_curl_passes(self):
        result = check_orientation(arm_curl_flexed())
        assert result.is_side_on
        assert result.shoulder_spread_ratio < SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO

    def test_side_on_pushup_passes(self):
        """Horizontal torso, but the shoulder axis still points at the camera."""
        assert check_orientation(pushup_top()).is_side_on

    def test_front_on_is_rejected(self):
        result = check_orientation(front_on_standing())
        assert not result.is_side_on
        assert result.reason == "front_on"
        assert result.shoulder_spread_ratio > SIDE_VIEW_SHOULDER_SPREAD_MAX_RATIO

    def test_ratio_is_distance_invariant(self):
        """Standing closer must not change the verdict — the ratio normalises it."""
        near = arm_curl_flexed(lateral_offset=0.04)
        far = arm_curl_flexed(lateral_offset=0.02)
        # Halve the apparent body size (as if standing twice as far away).
        far.array[:, :2] = 0.5 + (far.array[:, :2] - 0.5) * 0.5
        assert check_orientation(near).is_side_on
        assert check_orientation(far).is_side_on

    def test_person_too_far_away_is_flagged(self):
        pose = arm_curl_flexed()
        # Shrink the body to almost nothing in frame.
        pose.array[:, :2] = 0.5 + (pose.array[:, :2] - 0.5) * 0.1
        result = check_orientation(pose)
        assert not result.is_side_on
        assert result.reason == "torso_too_small"


class TestValidatorStatuses:
    def test_good_side_on_frame_is_ok(self):
        validator = FrameValidator(ARM_CURL)
        assert validator.validate(arm_curl_flexed(), "left", person_count=1).status == "ok"

    def test_missing_pose_is_reported_as_body_not_fully_visible(self):
        outcome = FrameValidator(PUSHUP).validate(None, "left", person_count=0)
        assert outcome.status == "body_not_fully_visible"
        assert outcome.detail == "no_pose_detected"

    def test_cropped_feet_is_body_not_fully_visible(self):
        outcome = FrameValidator(ARM_CURL).validate(
            cropped_feet_pose(), "left", person_count=1
        )
        assert outcome.status == "body_not_fully_visible"
        assert "ankles" in (outcome.detail or "")

    def test_low_joint_confidence_is_low_confidence(self):
        outcome = FrameValidator(ARM_CURL).validate(
            low_confidence_pose(), "left", person_count=1
        )
        assert outcome.status == "low_confidence"
        assert outcome.min_key_joint_visibility is not None
        assert outcome.min_key_joint_visibility < 0.6

    def test_front_on_view_is_flagged_after_hysteresis(self):
        validator = FrameValidator(ARM_CURL)
        pose = front_on_standing()
        statuses = [
            validator.validate(pose, "left", person_count=1).status for _ in range(5)
        ]
        assert statuses[: ORIENTATION_BAD_FRAMES_TO_FLAG - 1] == ["ok"] * (
            ORIENTATION_BAD_FRAMES_TO_FLAG - 1
        )
        assert statuses[-1] == "wrong_orientation_needs_side_view"

    def test_orientation_recovers_when_the_user_turns_side_on(self):
        validator = FrameValidator(ARM_CURL)
        for _ in range(ORIENTATION_BAD_FRAMES_TO_FLAG):
            validator.validate(front_on_standing(), "left", person_count=1)
        recovered = [
            validator.validate(arm_curl_flexed(), "left", person_count=1).status
            for _ in range(ORIENTATION_GOOD_FRAMES_TO_CLEAR + 1)
        ]
        assert recovered[-1] == "ok"

    def test_orientation_check_runs_continuously_not_only_at_start(self):
        """A user who drifts front-on mid-set must be caught."""
        validator = FrameValidator(ARM_CURL)
        for _ in range(30):
            assert validator.validate(arm_curl_flexed(), "left", person_count=1).status == "ok"
        for _ in range(ORIENTATION_BAD_FRAMES_TO_FLAG):
            outcome = validator.validate(front_on_standing(), "left", person_count=1)
        assert outcome.status == "wrong_orientation_needs_side_view"

    def test_second_person_is_reported_after_consecutive_hits(self):
        validator = FrameValidator(ARM_CURL)
        pose = arm_curl_flexed()
        statuses = [
            validator.validate(pose, "left", person_count=2).status
            for _ in range(MULTI_PERSON_CONSECUTIVE_HITS)
        ]
        assert statuses[-1] == "multiple_people_detected"
        assert statuses[0] == "ok", "one noisy frame must not interrupt a set"

    def test_highest_priority_failure_wins(self):
        """Several failures at once: the user is told the most fundamental one."""
        validator = FrameValidator(ARM_CURL)
        pose = low_confidence_pose()  # also front-on below
        pose = low_confidence_pose(lateral_offset=0.20, far_visibility=0.9)
        for _ in range(ORIENTATION_BAD_FRAMES_TO_FLAG):
            outcome = validator.validate(pose, "left", person_count=2)
        assert outcome.status == "multiple_people_detected"

    def test_reset_clears_all_hysteresis(self):
        validator = FrameValidator(ARM_CURL)
        for _ in range(ORIENTATION_BAD_FRAMES_TO_FLAG):
            validator.validate(front_on_standing(), "left", person_count=2)
        validator.reset()
        assert validator.validate(arm_curl_flexed(), "left", person_count=1).status == "ok"


class TestMultiPersonGate:
    def test_requires_consecutive_hits(self):
        gate = MultiPersonGate()
        verdicts = [gate.update(2) for _ in range(MULTI_PERSON_CONSECUTIVE_HITS)]
        assert verdicts[-1] is True
        assert not any(verdicts[:-1])

    def test_clears_after_quiet_frames(self):
        gate = MultiPersonGate()
        for _ in range(MULTI_PERSON_CONSECUTIVE_HITS):
            gate.update(2)
        verdicts = [gate.update(1) for _ in range(MULTI_PERSON_CLEAR_FRAMES)]
        assert verdicts[-1] is False

    def test_unknown_count_leaves_the_verdict_untouched(self):
        """An estimator that cannot count people must not fabricate a verdict."""
        gate = MultiPersonGate()
        assert gate.update(None) is False
        for _ in range(MULTI_PERSON_CONSECUTIVE_HITS):
            gate.update(2)
        assert gate.update(None) is True

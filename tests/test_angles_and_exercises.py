"""Per-exercise angle extraction and rule signals, on synthetic side-on poses.

These are the tests that pin the camera-angle assumptions: the measured angles
must mean what the exercise modules' docstrings say they mean.
"""

from __future__ import annotations

import numpy as np
import pytest

from pose_backend.geometry import angle_at
from pose_backend.landmarks import PoseLandmarks
from pose_backend.config import (
    ARM_CURL_ELBOW_DRIFT_MAX_DEG,
    PUSHUP_TORSO_MAX_DEG_FROM_HORIZONTAL,
)
from pose_backend.exercises import ARM_CURL, EXERCISES, PUSHUP, get_exercise
from pose_backend.exercises.base import torso_angle_from_horizontal_deg
from pose_backend.landmarks import LM
from synthetic_poses import (
    arm_curl_elbow_drifted,
    arm_curl_extended,
    arm_curl_flexed,
    pushup_bottom,
    pushup_sagging_hips,
    pushup_top,
)


class TestRegistry:
    def test_only_the_two_step_one_exercises_exist(self):
        assert sorted(EXERCISES) == ["arm_curl", "pushup"]

    def test_unknown_exercise_raises_clearly(self):
        with pytest.raises(KeyError, match="unknown exercise"):
            get_exercise("squat")

    def test_every_exercise_documents_its_camera_assumption(self):
        for exercise in EXERCISES.values():
            assert "side-on" in exercise.CAMERA_VIEW_ASSUMPTION.lower()


class TestTorsoDiscriminator:
    def test_pushup_torso_reads_near_horizontal(self):
        assert torso_angle_from_horizontal_deg(pushup_top()) < (
            PUSHUP_TORSO_MAX_DEG_FROM_HORIZONTAL
        )

    def test_arm_curl_torso_reads_near_vertical(self):
        assert torso_angle_from_horizontal_deg(arm_curl_flexed()) == pytest.approx(
            90.0, abs=2.0
        )


class TestPushUpAngles:
    def test_only_two_angles_are_returned(self):
        angles = PUSHUP.compute_angles(pushup_top(), "left")
        assert set(angles) == {"elbow_angle_deg", "body_line_angle_deg"}

    def test_top_of_rep_has_straight_arm(self):
        angles = PUSHUP.compute_angles(pushup_top(), "left")
        assert angles["elbow_angle_deg"] > 165.0

    def test_bottom_of_rep_has_bent_arm(self):
        angles = PUSHUP.compute_angles(pushup_bottom(), "left")
        assert 40.0 < angles["elbow_angle_deg"] < 110.0

    def test_good_form_body_line_is_straight(self):
        angles = PUSHUP.compute_angles(pushup_top(), "left")
        assert angles["body_line_angle_deg"] > 170.0

    def test_sagging_hips_lower_the_body_line_angle(self):
        straight = PUSHUP.compute_angles(pushup_top(), "left")["body_line_angle_deg"]
        sagging = PUSHUP.compute_angles(pushup_sagging_hips(), "left")[
            "body_line_angle_deg"
        ]
        assert sagging < straight - 20.0

    def test_ankle_is_a_key_joint(self):
        """The body line needs the ankle, so its confidence must gate the frame."""
        assert LM.LEFT_ANKLE in PUSHUP.key_joints("left")

    def test_scores_high_for_both_ends_of_a_rep(self):
        for pose in (pushup_top(), pushup_bottom()):
            assert PUSHUP.evaluate(pose).score >= 0.9

    def test_bad_form_still_reads_as_a_pushup(self):
        """Form grading is a later step: sagging hips must not break identity."""
        assert PUSHUP.evaluate(pushup_sagging_hips()).score >= 0.65

    def test_scores_low_on_a_standing_pose(self):
        assert PUSHUP.evaluate(arm_curl_flexed()).score < 0.65


class TestArmCurlAngles:
    def test_only_two_angles_are_returned(self):
        angles = ARM_CURL.compute_angles(arm_curl_flexed(), "left")
        assert set(angles) == {"elbow_angle_deg", "elbow_drift_angle_deg"}

    def test_extended_arm_reads_nearly_straight(self):
        angles = ARM_CURL.compute_angles(arm_curl_extended(), "left")
        assert angles["elbow_angle_deg"] > 160.0

    def test_flexed_arm_reads_deeply_bent(self):
        angles = ARM_CURL.compute_angles(arm_curl_flexed(), "left")
        assert angles["elbow_angle_deg"] < 45.0

    def test_tucked_elbow_has_small_drift_angle(self):
        angles = ARM_CURL.compute_angles(arm_curl_flexed(), "left")
        assert angles["elbow_drift_angle_deg"] < ARM_CURL_ELBOW_DRIFT_MAX_DEG

    def test_drifting_elbow_raises_the_drift_angle(self):
        tucked = ARM_CURL.compute_angles(arm_curl_flexed(), "left")
        drifted = ARM_CURL.compute_angles(arm_curl_elbow_drifted(), "left")
        assert drifted["elbow_drift_angle_deg"] > tucked["elbow_drift_angle_deg"] + 20.0

    def test_legs_are_not_key_joints(self):
        """Neither curl angle uses the legs, so they must not gate the frame."""
        key_joints = ARM_CURL.key_joints("left")
        assert LM.LEFT_ANKLE not in key_joints and LM.LEFT_KNEE not in key_joints

    def test_scores_high_across_a_rep(self):
        for pose in (arm_curl_extended(), arm_curl_flexed()):
            assert ARM_CURL.evaluate(pose).score >= 0.9

    def test_drifting_elbow_still_reads_as_a_curl(self):
        assert ARM_CURL.evaluate(arm_curl_elbow_drifted()).score >= 0.65

    def test_scores_low_on_a_pushup_pose(self):
        assert ARM_CURL.evaluate(pushup_bottom()).score < 0.65


class TestSignalWeights:
    def test_weights_sum_to_one(self):
        for exercise in EXERCISES.values():
            assert sum(exercise.weights.values()) == pytest.approx(1.0)

    def test_every_weighted_signal_is_produced(self):
        for exercise in EXERCISES.values():
            pose = arm_curl_flexed()
            signals = exercise.signals(pose, "left", exercise.compute_angles(pose, "left"))
            assert set(signals) == set(exercise.weights)


class TestAspectRatioCorrection:
    def test_same_physical_pose_measures_the_same_angle_in_any_frame_shape(self):
        """One body, two camera resolutions, same measured elbow angle.

        MediaPipe normalises x by width and y by height, so identical pixel
        geometry produces DIFFERENT normalised coordinates in a 1000x1000 frame
        and a 1600x900 one. Without the aspect correction in
        ``PoseLandmarks.point`` the same elbow would measure different angles in
        portrait and landscape, silently shifting every threshold in config.py.
        """
        # One pose in pixels, captured by two differently shaped sensors.
        pixels = pushup_bottom().array[:, :2] * 1000.0

        square = _pose_from_pixels(pixels, width=1000, height=1000)
        wide = _pose_from_pixels(pixels, width=1600, height=900)

        square_angle = PUSHUP.compute_angles(square, "left")["elbow_angle_deg"]
        wide_angle = PUSHUP.compute_angles(wide, "left")["elbow_angle_deg"]
        assert square_angle == pytest.approx(wide_angle, abs=0.5)

        # And prove the correction is what does it: on raw normalised
        # coordinates the two frames disagree substantially.
        raw_square = angle_at(
            square.raw_xy(LM.LEFT_SHOULDER),
            square.raw_xy(LM.LEFT_ELBOW),
            square.raw_xy(LM.LEFT_WRIST),
        )
        raw_wide = angle_at(
            wide.raw_xy(LM.LEFT_SHOULDER),
            wide.raw_xy(LM.LEFT_ELBOW),
            wide.raw_xy(LM.LEFT_WRIST),
        )
        assert abs(raw_square - raw_wide) > 5.0


def _pose_from_pixels(pixels, width: int, height: int) -> PoseLandmarks:
    """Normalise pixel coordinates the way MediaPipe does, for a given frame."""
    array = np.zeros((pixels.shape[0], 4), dtype=np.float32)
    array[:, 0] = pixels[:, 0] / width
    array[:, 1] = pixels[:, 1] / height
    array[:, 3] = 0.95
    return PoseLandmarks(array, width, height)

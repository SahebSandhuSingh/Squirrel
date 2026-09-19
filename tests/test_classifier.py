"""Rule-based classification and the consecutive-"unrecognized" state machine."""

from __future__ import annotations

from pose_backend.config import CLASSIFICATION_MIN_SCORE, UNRECOGNIZED_FRAME_LIMIT
from pose_backend.classifier import ExerciseClassifier
from synthetic_poses import (
    arm_curl_elbow_drifted,
    arm_curl_extended,
    arm_curl_flexed,
    pushup_bottom,
    pushup_sagging_hips,
    pushup_top,
)


class TestSelectedExerciseIsConfirmed:
    def test_pushup_session_recognises_pushup_frames(self):
        classifier = ExerciseClassifier("pushup")
        for pose in (pushup_top(), pushup_bottom()):
            result = classifier.classify(pose)
            assert result.detected_exercise == "pushup"
            assert result.confidence >= CLASSIFICATION_MIN_SCORE

    def test_arm_curl_session_recognises_curl_frames(self):
        classifier = ExerciseClassifier("arm_curl")
        for pose in (arm_curl_extended(), arm_curl_flexed(), arm_curl_elbow_drifted()):
            result = classifier.classify(pose)
            assert result.detected_exercise == "arm_curl"

    def test_bad_form_is_still_the_selected_exercise(self):
        result = ExerciseClassifier("pushup").classify(pushup_sagging_hips())
        assert result.detected_exercise == "pushup"

    def test_returns_only_the_selected_exercises_angles(self):
        result = ExerciseClassifier("arm_curl").classify(arm_curl_flexed())
        assert set(result.angles) == {"elbow_angle_deg", "elbow_drift_angle_deg"}

        result = ExerciseClassifier("pushup").classify(pushup_top())
        assert set(result.angles) == {"elbow_angle_deg", "body_line_angle_deg"}


class TestWrongPoseForSelection:
    def test_pushup_session_does_not_switch_to_arm_curl(self):
        """The backend validates the app's selection; it never re-selects."""
        result = ExerciseClassifier("pushup").classify(arm_curl_flexed())
        assert result.detected_exercise == "unrecognized"
        assert result.confidence < CLASSIFICATION_MIN_SCORE

    def test_arm_curl_session_does_not_switch_to_pushup(self):
        result = ExerciseClassifier("arm_curl").classify(pushup_bottom())
        assert result.detected_exercise == "unrecognized"

    def test_other_exercise_score_is_reported_for_diagnosis(self):
        """When the user picked the wrong exercise, the numbers say so."""
        result = ExerciseClassifier("pushup").classify(arm_curl_flexed())
        assert result.scores_by_exercise["arm_curl"] > result.scores_by_exercise["pushup"]

    def test_unrecognized_names_the_weak_signal(self):
        result = ExerciseClassifier("pushup").classify(arm_curl_flexed())
        assert result.reason == "weak:torso_horizontal"


class TestExplainability:
    def test_every_weighted_signal_is_reported(self):
        result = ExerciseClassifier("pushup").classify(pushup_top())
        assert set(result.signals) == {
            "torso_horizontal",
            "body_line_straightish",
            "wrist_below_shoulder",
        }

    def test_torso_discriminator_is_reported(self):
        pushup = ExerciseClassifier("pushup").classify(pushup_top())
        curl = ExerciseClassifier("arm_curl").classify(arm_curl_flexed())
        assert pushup.torso_angle_from_horizontal_deg < 35.0
        assert curl.torso_angle_from_horizontal_deg > 60.0

    def test_analysed_side_is_the_camera_facing_side(self):
        result = ExerciseClassifier("arm_curl").classify(arm_curl_flexed())
        assert result.side == "left"  # synthetic poses put the near side on the left


class TestUnrecognizedStreak:
    def test_streak_grows_then_flags_reposition(self):
        classifier = ExerciseClassifier("pushup")
        wrong_pose = arm_curl_flexed()
        for frame in range(1, UNRECOGNIZED_FRAME_LIMIT):
            classifier.classify(wrong_pose)
            assert classifier.unrecognized_streak == frame
            assert not classifier.needs_reposition_or_reselect
        classifier.classify(wrong_pose)
        assert classifier.needs_reposition_or_reselect

    def test_one_recognised_frame_clears_the_streak(self):
        classifier = ExerciseClassifier("pushup")
        for _ in range(UNRECOGNIZED_FRAME_LIMIT):
            classifier.classify(arm_curl_flexed())
        assert classifier.needs_reposition_or_reselect
        classifier.classify(pushup_top())
        assert classifier.unrecognized_streak == 0
        assert not classifier.needs_reposition_or_reselect

    def test_invalid_frames_freeze_rather_than_advance_the_streak(self):
        """A frame that failed validation is not evidence about the exercise."""
        classifier = ExerciseClassifier("pushup")
        classifier.classify(arm_curl_flexed())
        for _ in range(50):
            classifier.note_unclassified_frame()
        assert classifier.unrecognized_streak == 1
        assert not classifier.needs_reposition_or_reselect

    def test_reset_clears_state(self):
        classifier = ExerciseClassifier("pushup")
        for _ in range(UNRECOGNIZED_FRAME_LIMIT):
            classifier.classify(arm_curl_flexed())
        classifier.reset()
        assert classifier.unrecognized_streak == 0
        assert not classifier.needs_reposition_or_reselect

"""Protocol frame validation tests."""

from __future__ import annotations

import pytest

from backend.core.frame import FrameValidationError, validate_training_frame


def test_valid_partial_landmark_frame_is_normalized():
    frame = validate_training_frame(
        {
            "t_ms": 10,
            "keypoints": {
                "left_hip": {"x": 1, "y": 2.5, "z": -0.1, "v": 0.75},
            },
        },
        previous_t_ms=10,
    )
    assert frame.t_ms == 10.0
    assert frame.keypoints["left_hip"] == {"x": 1.0, "y": 2.5, "z": -0.1, "v": 0.75}


def test_missing_landmarks_are_tracking_unavailability_not_malformed():
    frame = validate_training_frame({"t_ms": 0, "keypoints": {}}, previous_t_ms=None)
    assert frame.keypoints == {}


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"keypoints": {}}, "t_ms must be numeric"),
        ({"t_ms": float("nan"), "keypoints": {}}, "t_ms must be finite"),
        ({"t_ms": 0, "keypoints": []}, "keypoints must be a mapping"),
        (
            {"t_ms": 0, "keypoints": {"invented_joint": {"x": 0, "y": 0, "v": 1}}},
            "unknown landmark",
        ),
        (
            {"t_ms": 0, "keypoints": {"left_hip": {"x": 0, "y": 0, "v": 1.1}}},
            "within [0, 1]",
        ),
        (
            {"t_ms": 0, "keypoints": {"left_hip": {"x": True, "y": 0, "v": 1}}},
            "must be numeric",
        ),
    ],
)
def test_malformed_frame_shapes_fail_loud(payload, message):
    with pytest.raises(FrameValidationError, match=message.replace("[", r"\[").replace("]", r"\]")):
        validate_training_frame(payload, previous_t_ms=None)


def test_timestamp_regression_is_rejected():
    with pytest.raises(FrameValidationError, match="monotonic"):
        validate_training_frame({"t_ms": 9, "keypoints": {}}, previous_t_ms=10)

"""Stage 7 contract tests for the generic setup and baseline orchestrator."""

from __future__ import annotations

from dataclasses import replace

import pytest

from backend.training.setup_config import SetupConfig
from backend.training.setup_contract import BaselineValidation, ConditionResult
from backend.training.setup_flow import COLLECTING, PRECHECK, READY, VALIDATING, SetupOrchestrator
from backend.workouts.squat.setup_adapter import build_squat_setup_adapter

_GATE = (
    "nose",
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
)


def _config(**changes: object) -> SetupConfig:
    config = SetupConfig(
        exercise="squat",
        required_keypoints=_GATE,
        pre_check_templates=("standing_posture", "stance_width"),
        baseline_capture_templates=("standing_posture", "stance_width"),
        stable_ms=100.0,
        baseline_required=True,
        baseline_file="squat_baseline_keypoints.json",
        capture_duration_ms=300.0,
        min_valid_samples=4,
        min_valid_coverage=0.8,
        invalid_pause_ms=50.0,
        invalid_reset_ms=200.0,
        max_joint_stddev_px=8.0,
    )
    return replace(config, **changes)


def _frame(
    *,
    ankle_width: float = 100.0,
    bent_knees: bool = False,
    crouched: bool = False,
    hidden: tuple[str, ...] = (),
    nose_x: float = 200.0,
) -> dict:
    left_x = 200.0 + ankle_width / 2
    right_x = 200.0 - ankle_width / 2
    hip_y = 220.0 if crouched else 100.0
    points = {
        "nose": (nose_x, 20.0),
        "left_shoulder": (250.0, 50.0),
        "right_shoulder": (150.0, 50.0),
        "left_hip": (left_x, hip_y),
        "right_hip": (right_x, hip_y),
        "left_knee": ((290.0 if bent_knees else left_x), 200.0),
        "right_knee": ((110.0 if bent_knees else right_x), 200.0),
        "left_ankle": (left_x, 300.0),
        "right_ankle": (right_x, 300.0),
    }
    return {
        name: {
            "x": x,
            "y": y,
            "z": 0.0,
            "v": 0.2 if name in hidden else 0.99,
        }
        for name, (x, y) in points.items()
    }


def _orchestrator(**changes: object) -> SetupOrchestrator:
    return SetupOrchestrator(_config(**changes), build_squat_setup_adapter())


def _enter_capture(orchestrator: SetupOrchestrator) -> None:
    assert orchestrator.update(_frame(), 0.0).phase == PRECHECK
    assert orchestrator.update(_frame(), 100.0).phase == COLLECTING


def test_combined_precheck_streams_every_failure_and_missing_keypoint() -> None:
    orchestrator = _orchestrator()

    status = orchestrator.update(
        _frame(ankle_width=50.0, bent_knees=True, hidden=("nose",)),
        0.0,
    )

    assert status.phase == PRECHECK
    assert status.missing == ("nose",)
    assert tuple(result.template_id for result in status.conditions) == (
        "standing_posture",
        "stance_width",
    )
    assert {result.reason_id for result in status.failures} == {
        "knees_not_extended",
        "stance_too_narrow",
    }


def test_any_precheck_failure_resets_the_one_continuous_dwell() -> None:
    orchestrator = _orchestrator(stable_ms=200.0)
    orchestrator.update(_frame(), 0.0)
    status = orchestrator.update(_frame(hidden=("nose",)), 150.0)
    assert status.dwell_ms == 0.0

    orchestrator.update(_frame(), 200.0)
    assert orchestrator.update(_frame(), 350.0).phase == PRECHECK
    assert orchestrator.update(_frame(), 400.0).phase == COLLECTING


@pytest.mark.parametrize("ratio", (0.70, 0.79, 0.80, 1.20, 1.21, 1.30))
def test_setup_stance_warning_and_safe_ranges_allow_capture(ratio: float) -> None:
    adapter = build_squat_setup_adapter()
    result = adapter.evaluate(("stance_width",), _frame(ankle_width=ratio * 100))[0]

    assert result.status == "passed"
    assert result.measurements["ratio"] == pytest.approx(ratio)
    assert result.measurements["skeleton_color"] == "green"


def test_setup_stance_rejects_values_below_or_above_the_range() -> None:
    adapter = build_squat_setup_adapter()

    narrow = adapter.evaluate(("stance_width",), _frame(ankle_width=69.0))[0]
    wide = adapter.evaluate(("stance_width",), _frame(ankle_width=131.0))[0]

    assert narrow.reason_id == "stance_too_narrow"
    assert wide.reason_id == "stance_too_wide"
    assert narrow.measurements["state"] == "not_ok"
    assert wide.measurements["skeleton_color"] == "red"


def test_standing_posture_requires_extended_knees_and_hips_above_knees() -> None:
    adapter = build_squat_setup_adapter()

    bent = adapter.evaluate(("standing_posture",), _frame(bent_knees=True))[0]
    crouched = adapter.evaluate(("standing_posture",), _frame(crouched=True))[0]

    assert bent.reason_id == "knees_not_extended"
    assert bent.measurements["left_knee_angle_deg"] < 160.0
    assert crouched.reason_id == "hips_not_above_knees"
    assert crouched.measurements["hip_above_knee"] is False


def test_standing_posture_is_unavailable_when_a_required_joint_is_not_usable() -> None:
    adapter = build_squat_setup_adapter()

    result = adapter.evaluate(
        ("standing_posture",),
        _frame(hidden=("left_knee",)),
    )[0]

    assert result.status == "unavailable"
    assert result.reason_id == "standing_posture_unavailable"


def test_capture_evaluates_all_selected_conditions_on_every_frame() -> None:
    orchestrator = _orchestrator()
    _enter_capture(orchestrator)

    status = orchestrator.update(_frame(ankle_width=50.0, bent_knees=True), 150.0)

    assert tuple(result.template_id for result in status.conditions) == (
        "standing_posture",
        "stance_width",
    )
    assert len(status.failures) == 2
    assert status.frames_collected == 0


def test_short_invalid_capture_period_pauses_without_crediting_time() -> None:
    orchestrator = _orchestrator(stable_ms=0.0)
    assert orchestrator.update(_frame(), 0.0).phase == COLLECTING
    orchestrator.update(_frame(), 50.0)
    orchestrator.update(_frame(), 100.0)
    orchestrator.update(_frame(hidden=("nose",)), 150.0)

    paused = orchestrator.update(_frame(hidden=("nose",)), 225.0)
    assert paused.phase == COLLECTING
    assert paused.capture_paused is True
    assert paused.capture_valid_ms == 100.0

    resumed = orchestrator.update(_frame(), 250.0)
    advanced = orchestrator.update(_frame(), 300.0)
    assert resumed.capture_valid_ms == 100.0
    assert advanced.capture_valid_ms == 150.0


def test_invalid_capture_period_at_reset_tolerance_restarts_precheck() -> None:
    orchestrator = _orchestrator(stable_ms=0.0)
    orchestrator.update(_frame(), 0.0)
    orchestrator.update(_frame(), 50.0)
    orchestrator.update(_frame(), 100.0)
    orchestrator.update(_frame(hidden=("nose",)), 150.0)

    status = orchestrator.update(_frame(hidden=("nose",)), 350.0)

    assert status.phase == PRECHECK
    assert status.frames_collected == 0
    assert orchestrator.baseline is None


def test_capture_duration_does_not_bypass_minimum_sample_count() -> None:
    orchestrator = _orchestrator(
        stable_ms=0.0,
        capture_duration_ms=100.0,
        min_valid_samples=5,
    )
    orchestrator.update(_frame(), 0.0)
    orchestrator.update(_frame(), 50.0)

    status = orchestrator.update(_frame(), 150.0)
    assert status.phase == COLLECTING
    assert status.capture_valid_ms == 100.0
    assert status.frames_collected == 2

    orchestrator.update(_frame(), 200.0)
    orchestrator.update(_frame(), 250.0)
    status = orchestrator.update(_frame(), 300.0)
    assert status.phase == VALIDATING


def test_unstable_capture_is_rejected_and_cleared() -> None:
    orchestrator = _orchestrator(
        stable_ms=0.0,
        capture_duration_ms=100.0,
        min_valid_samples=3,
    )
    orchestrator.update(_frame(), 0.0)
    orchestrator.update(_frame(nose_x=180.0), 50.0)
    orchestrator.update(_frame(nose_x=220.0), 100.0)
    status = orchestrator.update(_frame(nose_x=180.0), 150.0)

    assert status.phase == PRECHECK
    assert status.frames_collected == 0
    assert status.validation_results[0].reason_id == "baseline_unstable"
    assert orchestrator.baseline is None


def test_valid_candidate_contains_no_fallbacks_and_requires_explicit_ready_mark() -> None:
    orchestrator = _orchestrator(
        stable_ms=0.0,
        capture_duration_ms=100.0,
        min_valid_samples=3,
    )
    orchestrator.update(_frame(), 0.0)
    orchestrator.update(_frame(), 50.0)
    orchestrator.update(_frame(), 100.0)
    status = orchestrator.update(_frame(), 150.0)

    assert status.phase == VALIDATING
    assert status.baseline_candidate_ready is True
    assert status.baseline_ready is False
    assert orchestrator.baseline is not None
    assert set(orchestrator.baseline) == set(_GATE)
    assert all(point["x"] != 0.0 and point["y"] != 0.0 for point in orchestrator.baseline.values())
    assert status.quality is not None
    assert status.quality.valid_samples == 3
    assert any(result.template_id == "depth_reference" for result in status.validation_results)

    ready = orchestrator.mark_ready()
    assert ready.phase == READY
    assert ready.baseline_ready is True


class _OtherExerciseAdapter:
    def __init__(self) -> None:
        self.selections: list[tuple[str, ...]] = []

    def evaluate(self, template_ids: tuple[str, ...], keypoints: dict) -> tuple[ConditionResult, ...]:
        self.selections.append(template_ids)
        passed = keypoints["nose"]["x"] >= 0
        return tuple(
            ConditionResult(template_id, "passed" if passed else "failed", None if passed else "misaligned")
            for template_id in template_ids
        )

    def validate_baseline(self, baseline, quality, template_ids) -> BaselineValidation:
        del baseline, quality
        return BaselineValidation(
            True,
            tuple(ConditionResult(template_id, "passed") for template_id in template_ids),
        )


def test_generic_orchestrator_has_no_squat_template_or_anatomy_dependency() -> None:
    adapter = _OtherExerciseAdapter()
    config = SetupConfig(
        exercise="other",
        required_keypoints=("nose",),
        pre_check_templates=("alignment",),
        baseline_capture_templates=("reference_pose",),
        stable_ms=0.0,
        baseline_required=True,
        baseline_file="other.json",
        capture_duration_ms=50.0,
        min_valid_samples=2,
        min_valid_coverage=1.0,
        invalid_pause_ms=10.0,
        invalid_reset_ms=100.0,
        max_joint_stddev_px=5.0,
    )
    orchestrator = SetupOrchestrator(config, adapter)
    keypoints = {"nose": {"x": 1.0, "y": 2.0, "v": 0.99}}

    orchestrator.update(keypoints, 0.0)
    orchestrator.update(keypoints, 50.0)
    status = orchestrator.update(keypoints, 100.0)

    assert status.phase == VALIDATING
    assert adapter.selections == [
        ("alignment",),
        ("reference_pose",),
        ("reference_pose",),
    ]

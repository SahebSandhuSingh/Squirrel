"""Squat-specific setup conditions and final baseline validation."""

from __future__ import annotations

from backend.engine.loader import ExerciseConfiguration, load_exercise_config
from backend.training.baseline import BaselineQuality
from backend.training.setup_contract import BaselineValidation, ConditionResult
from backend.workouts.squat.rules.stance_width import StanceWidthRule
from backend.workouts.squat.rules.standing_posture import StandingPostureRule


class SquatSetupAdapter:
    def __init__(self, config: ExerciseConfiguration) -> None:
        self._config = config
        stance = config.templates["stance_width"]
        self._stance = StanceWidthRule(
            stance["policy"]["ranges"],
            min_shoulder_px=stance["min_shoulder_px"],
        )
        posture = config.templates["standing_posture"]
        posture_policy = posture["setup_policy"]
        self._posture = StandingPostureRule(
            min_knee_extension_deg=posture_policy["min_knee_extension_deg"],
            require_hip_above_knee=posture_policy["require_hip_above_knee"],
        )

    def evaluate(
        self,
        template_ids: tuple[str, ...],
        keypoints: dict,
    ) -> tuple[ConditionResult, ...]:
        return tuple(
            self._evaluate_one(template_id, keypoints, reference=False)
            for template_id in template_ids
        )

    def validate_baseline(
        self,
        baseline: dict,
        quality: BaselineQuality,
        template_ids: tuple[str, ...],
    ) -> BaselineValidation:
        del quality
        results = [
            self._evaluate_one(template_id, baseline, reference=True)
            for template_id in template_ids
        ]
        depth = self._config.templates["depth"]
        hip_y = _midpoint_y(baseline, "left_hip", "right_hip")
        knee_y = _midpoint_y(baseline, "left_knee", "right_knee")
        minimum_span = float(depth["min_baseline_span_px"])
        if hip_y is None or knee_y is None:
            results.append(
                ConditionResult(
                    "depth_reference",
                    "unavailable",
                    "baseline_depth_reference_unavailable",
                    depth["cue"],
                )
            )
        else:
            span = knee_y - hip_y
            results.append(
                ConditionResult(
                    "depth_reference",
                    "passed" if span >= minimum_span else "failed",
                    None if span >= minimum_span else "baseline_span_too_small",
                    None if span >= minimum_span else depth["cue"],
                    {"hip_to_knee_span_px": round(span, 3), "minimum_px": minimum_span},
                )
            )
        output = tuple(results)
        return BaselineValidation(all(result.passed for result in output), output)

    def _evaluate_one(
        self,
        template_id: str,
        keypoints: dict,
        *,
        reference: bool,
    ) -> ConditionResult:
        template = self._config.templates[template_id]
        if template_id == "standing_posture":
            reading = (
                self._posture.read_reference(keypoints)
                if reference
                else self._posture.read(keypoints)
            )
            if reading is None:
                return ConditionResult(
                    template_id,
                    "unavailable",
                    "standing_posture_unavailable",
                    template["cue"],
                )
            if not reading.hip_above_knee:
                reason = "hips_not_above_knees"
            elif not reading.passed:
                reason = "knees_not_extended"
            else:
                reason = None
            return ConditionResult(
                template_id,
                "passed" if reading.passed else "failed",
                reason,
                None if reading.passed else template["cue"],
                {
                    "left_knee_angle_deg": reading.left_knee_angle_deg,
                    "right_knee_angle_deg": reading.right_knee_angle_deg,
                    "hip_above_knee": reading.hip_above_knee,
                },
            )
        if template_id == "stance_width":
            reading = (
                self._stance.read_reference(keypoints)
                if reference
                else self._stance.read(keypoints)
            )
            if reading is None:
                return ConditionResult(
                    template_id,
                    "unavailable",
                    "stance_width_unavailable",
                    template["cue"],
                )
            passed = not reading.not_ok
            reason = None if passed else f"stance_too_{reading.side}"
            return ConditionResult(
                template_id,
                "passed" if passed else "failed",
                reason,
                None if passed else template["cue"],
                {
                    "ratio": round(reading.ratio, 3),
                    "state": reading.state,
                    "skeleton_color": reading.skeleton_color,
                    "side": reading.side,
                },
            )
        raise ValueError(f"unsupported squat setup template: {template_id}")


def build_squat_setup_adapter(
    *,
    config: ExerciseConfiguration | None = None,
) -> SquatSetupAdapter:
    return SquatSetupAdapter(config or load_exercise_config("squat"))


def _midpoint_y(baseline: dict, left: str, right: str) -> float | None:
    try:
        return (float(baseline[left]["y"]) + float(baseline[right]["y"])) / 2
    except (KeyError, TypeError, ValueError):
        return None

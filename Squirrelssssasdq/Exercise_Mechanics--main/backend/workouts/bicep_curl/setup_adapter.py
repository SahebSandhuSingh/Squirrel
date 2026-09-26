"""Bicep curl setup conditions and final baseline validation.

Pre-check requires two conditions held together: shoulder-width stance and both arms extended. The
same two are re-validated on the captured median baseline before it is accepted. The stance kernel
is shared with squat (identical policy across exercises); arms-extended is curl-local.

The setup conditions validate the standing capture posture. Live adapter construction then validates
the persisted wrist-height and shoulder-to-hip references before the baseline is accepted.
"""

from __future__ import annotations

from backend.engine.loader import ExerciseConfiguration, load_exercise_config
from backend.training.baseline import BaselineQuality
from backend.training.setup_contract import BaselineValidation, ConditionResult
from backend.workouts.bicep_curl.rules.arms_extended import ArmsExtendedRule
from backend.workouts.squat.rules.stance_width import StanceWidthRule


class BicepCurlSetupAdapter:
    def __init__(self, config: ExerciseConfiguration) -> None:
        self._config = config
        stance = config.templates["stance_width"]
        self._stance = StanceWidthRule(
            stance["policy"]["ranges"],
            min_shoulder_px=stance["min_shoulder_px"],
        )
        arms = config.templates["arms_extended"]
        self._arms = ArmsExtendedRule(
            min_elbow_extension_deg=arms["setup_policy"]["min_elbow_extension_deg"],
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
        results = tuple(
            self._evaluate_one(template_id, baseline, reference=True)
            for template_id in template_ids
        )
        return BaselineValidation(all(result.passed for result in results), results)

    def _evaluate_one(
        self,
        template_id: str,
        keypoints: dict,
        *,
        reference: bool,
    ) -> ConditionResult:
        template = self._config.templates[template_id]
        if template_id == "arms_extended":
            reading = (
                self._arms.read_reference(keypoints)
                if reference
                else self._arms.read(keypoints)
            )
            if reading is None:
                return ConditionResult(
                    template_id,
                    "unavailable",
                    "arms_extended_unavailable",
                    template["cue"],
                )
            reason = None if reading.passed else "arms_not_extended"
            return ConditionResult(
                template_id,
                "passed" if reading.passed else "failed",
                reason,
                None if reading.passed else template["cue"],
                {
                    "left_elbow_angle_deg": reading.left_elbow_angle_deg,
                    "right_elbow_angle_deg": reading.right_elbow_angle_deg,
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
        raise ValueError(f"unsupported bicep curl setup template: {template_id}")


def build_bicep_curl_setup_adapter(
    *,
    config: ExerciseConfiguration | None = None,
) -> BicepCurlSetupAdapter:
    return BicepCurlSetupAdapter(config or load_exercise_config("bicep_curl"))

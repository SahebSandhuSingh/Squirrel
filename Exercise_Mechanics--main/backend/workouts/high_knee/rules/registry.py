"""Closed exercise-local registry for High Knee live-rule construction."""

from __future__ import annotations

from types import MappingProxyType, ModuleType
from typing import TYPE_CHECKING

from backend.engine.loader import LIVE_ALLOWED_TUNING_STATUSES

from backend.workouts.high_knee.rules import (
    knee_drive_rom,
    knee_tracking_corridor,
    lateral_torso_lean,
    left_right_asymmetry,
)

_MODULES = (
    knee_tracking_corridor,
    lateral_torso_lean,
    knee_drive_rom,
    left_right_asymmetry,
)
RULE_MODULES: MappingProxyType[str, ModuleType] = MappingProxyType(
    {module.RULE_ID: module for module in _MODULES}
)

if TYPE_CHECKING:
    from backend.engine.loader import ExerciseConfiguration


def rule_module(rule_id: str) -> ModuleType:
    try:
        return RULE_MODULES[rule_id]
    except KeyError as exc:
        raise KeyError(f"no High Knee rule module registered for '{rule_id}'") from exc


def active_live_rule_modules(
    config: "ExerciseConfiguration",
) -> MappingProxyType[str, ModuleType]:
    """Resolve active High Knee modules and fail closed on unsafe configuration drift."""
    selected: dict[str, ModuleType] = {}
    for rule_id, active in config.contexts["live"].items():
        if not active:
            continue
        module = rule_module(rule_id)
        if config.templates[rule_id]["tuning_status"] not in LIVE_ALLOWED_TUNING_STATUSES:
            raise RuntimeError(f"active live rule '{rule_id}' is not tuning-ready")
        declared = getattr(module, "REQUIRED_KEYPOINTS", None)
        configured = tuple(config.templates[rule_id]["required_keypoints"])
        if declared != configured:
            raise RuntimeError(
                f"live rule '{rule_id}' keypoint declaration does not match configuration"
            )
        selected[rule_id] = module
    return MappingProxyType(selected)

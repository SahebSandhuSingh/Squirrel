"""Exercise-local module registry for bicep curl live-rule adapter construction."""

from __future__ import annotations

from types import MappingProxyType
from types import ModuleType
from typing import TYPE_CHECKING

from backend.engine.loader import LIVE_ALLOWED_TUNING_STATUSES
from backend.workouts.bicep_curl.rules import (
    curl_rom,
    elbow_flare_corridor,
    lateral_torso_lean,
    shoulder_elevation,
)

if TYPE_CHECKING:
    from backend.engine.loader import ExerciseConfiguration

# Stance and arms-extended are setup-only and never appear in the live registry.
_MODULES = (elbow_flare_corridor, lateral_torso_lean, shoulder_elevation, curl_rom)
LIVE_RULE_MODULES: MappingProxyType[str, ModuleType] = MappingProxyType(
    {module.RULE_ID: module for module in _MODULES}
)


def live_rule_module(rule_id: str) -> ModuleType:
    """Return the explicitly registered curl live-rule module or fail on an unknown ID."""
    try:
        return LIVE_RULE_MODULES[rule_id]
    except KeyError as exc:
        raise KeyError(f"no bicep curl live-rule module registered for '{rule_id}'") from exc


def active_live_rule_modules(
    config: "ExerciseConfiguration",
) -> MappingProxyType[str, ModuleType]:
    """Resolve exactly the configured active live modules and reject unsafe activation."""
    selected: dict[str, ModuleType] = {}
    for rule_id, active in config.contexts["live"].items():
        if not active:
            continue
        module = live_rule_module(rule_id)
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

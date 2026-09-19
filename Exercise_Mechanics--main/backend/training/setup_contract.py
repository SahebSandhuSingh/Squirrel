"""Exercise-neutral contracts between the setup orchestrator and exercise adapters."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Mapping, Protocol

from backend.training.baseline import BaselineQuality

ConditionStatus = Literal["passed", "failed", "unavailable"]


@dataclass(frozen=True)
class ConditionResult:
    template_id: str
    status: ConditionStatus
    reason_id: str | None = None
    cue: str | None = None
    measurements: Mapping[str, object] = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return self.status == "passed"


@dataclass(frozen=True)
class BaselineValidation:
    passed: bool
    results: tuple[ConditionResult, ...]


class SetupExerciseAdapter(Protocol):
    def evaluate(
        self,
        template_ids: tuple[str, ...],
        keypoints: dict,
    ) -> tuple[ConditionResult, ...]: ...

    def validate_baseline(
        self,
        baseline: dict,
        quality: BaselineQuality,
        template_ids: tuple[str, ...],
    ) -> BaselineValidation: ...

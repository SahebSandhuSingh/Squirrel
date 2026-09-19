from __future__ import annotations

import json
from copy import deepcopy

import pytest

from backend.core.frame import TrainingFrame
from backend.engine.loader import ConfigurationError, ExerciseConfiguration, _validate_fsm
from backend.reports.builder import _timed_exercise_report
from backend.training.builders import EXERCISE_BUILDERS, build_training_adapter
from backend.training.debug_capture import TrainingDebugCapture
from backend.training.replay import TimedReplayCapture, load_replay_capture, replay_capture
from backend.training.target_contract import RepTarget, TimeTarget
from backend.training.timed_set import TimedSetTimer


_TRANSITIONS = [
    {"from": "setup", "to": "setup", "when": "tracking_recovery_failed", "action": "reset_attempt"},
    {"from": "setup", "to": "ascent", "when": "descent_started"},
    {"from": "ascent", "to": "ascent", "when": "full_rom_reached"},
    {"from": "ascent", "to": "descent", "when": "turnaround_confirmed"},
    {"from": "descent", "to": "reset", "when": "top_returned", "action": "complete_attempt", "emit": "attempt_completed"},
    {"from": "reset", "to": "reset", "when": "tracking_recovery_failed", "action": "reset_attempt"},
    {"from": "reset", "to": "setup", "when": "reset_dwell_elapsed", "action": "reset_attempt", "emit": "rep_cycle_completed"},
]


def _timed_fsm() -> dict:
    return {
        "schema_version": 2,
        "movement_type": "time",
        "phases": ["setup", "ascent", "descent", "reset"],
        "initial_phase": "setup",
        "transitions": deepcopy(_TRANSITIONS),
        "movement_start": 0.15,
        "reset": 0.10,
        "min_lift_peak": 0.30,
        "turnaround_ms": 150,
        "reset_dwell_ms": 200,
        "stale_phase_ms": 5_000,
    }


def _config() -> ExerciseConfiguration:
    return ExerciseConfiguration(
        slug="timed_stub",
        templates={},
        contexts={"pre_check": {}, "baseline_capture": {}, "live": {}},
        scoring={"version": 1},
        fsm=_timed_fsm(),
        setup={},
    )


class _TimedStubAdapter:
    def __init__(self, target_duration_ms: int, config: ExerciseConfiguration) -> None:
        self._timer = TimedSetTimer(target_duration_ms)
        self._config = config

    def process(self, frame: TrainingFrame) -> dict:
        update = self._timer.update(frame.t_ms)
        return {
            "phase": "complete" if update.status.complete else "active",
            "movement": {
                "detected_cycles": 0,
                "counted_lifts": 0,
                "full_lifts": 0,
                "shallow_lifts": 0,
                "invalid_lifts": 0,
                "left_lifts": 0,
                "right_lifts": 0,
            },
            "set": update.status.document(),
            "events": {"lift_cycles": [], "set_completed": update.set_completed},
        }

    def debug_snapshot(self) -> dict:
        return {"rules": {}, "fsm": {}}

    def runtime_metadata(self) -> dict:
        return {
            "active_rule_ids": [],
            "templates": {},
            "contexts": deepcopy(self._config.contexts),
            "scoring": deepcopy(self._config.scoring),
            "fsm": deepcopy(self._config.fsm),
        }


def _build_stub(*, baseline: dict, target_duration_ms: int, config: ExerciseConfiguration):
    assert isinstance(baseline, dict)
    return _TimedStubAdapter(target_duration_ms, config)


def test_timed_fsm_schema_is_strict_and_keeps_units_distinct():
    validated = _validate_fsm(_timed_fsm())
    assert validated["movement_start"] == 0.15
    assert validated["min_lift_peak"] == 0.30
    assert "min_rep_peak" not in validated

    mixed = _timed_fsm()
    mixed["min_rep_peak"] = 0.30
    with pytest.raises(ConfigurationError, match="unknown fields"):
        _validate_fsm(mixed)

    unordered = _timed_fsm()
    unordered["reset"] = unordered["movement_start"]
    with pytest.raises(ConfigurationError, match="timed FSM progress thresholds"):
        _validate_fsm(unordered)


def test_builder_dispatches_typed_targets_without_fake_reps(monkeypatch):
    monkeypatch.setitem(EXERCISE_BUILDERS, "timed_stub", _build_stub)
    adapter = build_training_adapter(
        "timed_stub",
        baseline={},
        target=TimeTarget("time", 1_000),
        config=_config(),
    )
    assert isinstance(adapter, _TimedStubAdapter)

    with pytest.raises(ValueError, match="does not match"):
        build_training_adapter(
            "timed_stub",
            baseline={},
            target=RepTarget("reps", 10),
            config=_config(),
        )


def test_timed_stub_capture_replay_and_report_are_continuous(tmp_path, monkeypatch):
    monkeypatch.setitem(EXERCISE_BUILDERS, "timed_stub", _build_stub)
    set_dir = tmp_path / "set_1"
    baseline_dir = set_dir / "baseline_kp_data"
    baseline_dir.mkdir(parents=True)
    (baseline_dir / "timed_stub_baseline.json").write_text(
        json.dumps({"schema_version": 1, "keypoints": {}, "quality": {}}),
        encoding="utf-8",
    )
    adapter = build_training_adapter(
        "timed_stub",
        baseline={},
        target=TimeTarget("time", 1_000),
        config=_config(),
    )
    capture = TrainingDebugCapture(
        set_dir,
        exercise_id="timed_stub",
        set_no=1,
        runtime_metadata=adapter.runtime_metadata(),
    )
    for timestamp in (100.0, 600.0, 1_100.0):
        frame = TrainingFrame(timestamp, {})
        status = adapter.process(frame)
        capture.record(frame, status, adapter.debug_snapshot())

    assert not tuple(set_dir.glob("rep_*"))
    assert len(tuple((set_dir / "frames/keypoints").glob("frame_*.json"))) == 3
    summary = json.loads((set_dir / "set_summary.json").read_text(encoding="utf-8"))
    assert summary["movement_type"] == "time"
    assert summary["target_duration_ms"] == 1_000
    assert summary["status"] == "complete"

    loaded = load_replay_capture(set_dir)
    assert isinstance(loaded, TimedReplayCapture)
    assert loaded.target_duration_ms == 1_000
    assert replay_capture(loaded) == {
        "ok": True,
        "checked_frames": 3,
        "mismatch_count": 0,
        "mismatches": [],
    }

    report = _timed_exercise_report(
        {
            "created_at": "2026-07-20T10:00:00Z",
            "skill_level": "beginner",
            "plan": {
                "exercise_id": "timed_stub",
                "exercise_name": "Timed Stub",
                "sets": 1,
                "target": {"type": "time", "value_ms": 1_000},
                "metadata": {},
            },
        },
        "session-1",
        "timed_stub",
        tmp_path,
    )
    assert report["planned"] == {
        "sets": 1,
        "duration_seconds": 1.0,
        "total_duration_seconds": 1.0,
    }
    assert report["actual"] == {
        "sets_completed": 1,
        "counted_lifts": 0,
        "detected_cycles": 0,
    }

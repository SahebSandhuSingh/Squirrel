"""Per-frame live capture layout, schema completion and rep-boundary tests."""

from __future__ import annotations

import json

from backend.core.frame import TrainingFrame
from backend.core.landmarks import ALL_LANDMARKS
from backend.training.debug_capture import MISSING_VALUE, TrainingDebugCapture


def _status(*, phase: str, completed: bool = False, discarded: bool = False) -> dict:
    attempt = (
        {
            "attempt": 1,
            "rep": 1,
            "qualified": True,
            "classification": "full_rom",
            "score": 93.0,
        }
        if completed
        else None
    )
    return {
        "tracking": {"available": True, "unavailable_rule_ids": []},
        "phase": phase,
        "counters": {"attempts": int(completed), "qualified": int(completed)},
        "rom": {"ratio": 0.9},
        "active_rule_ids": ["depth"],
        "issues": [],
        "cue": None,
        "last_attempt": attempt,
        "last_rep": attempt,
        "set": {"completed_reps": int(completed)},
        "score_coverage": {"ratio": 1.0} if completed else None,
        "events": {
            "attempt_completed": completed,
            "rep_completed": completed,
            "attempt_discarded": discarded,
            "rep_cycle_completed": False,
            "set_cycle_completed": False,
        },
    }


def _capture(tmp_path) -> TrainingDebugCapture:
    return TrainingDebugCapture(
        tmp_path / "set_1",
        exercise_id="squat",
        set_no=1,
        runtime_metadata={
            "active_rule_ids": ["depth"],
            "templates": {
                "depth": {
                    "full_rom_gate": 0.85,
                    "scoring": {
                        "role": "rom",
                        "evidence_phases": ["descent", "bottom", "ascent"],
                    },
                }
            },
            "contexts": {"live": {"depth": True}},
            "scoring": {"version": 1},
            "fsm": {
                "movement_type": "reps",
                "phases": ["setup", "descent", "bottom", "ascent", "reset"],
            },
        },
    )


def _read(path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_capture_constructor_does_not_create_an_empty_rep_directory(tmp_path):
    capture = _capture(tmp_path)

    assert capture.rep_no is None
    assert not (tmp_path / "set_1").exists()


def test_capture_timing_phase_names_come_from_runtime_metadata(tmp_path):
    set_dir = tmp_path / "set_1"
    capture = TrainingDebugCapture(
        set_dir,
        exercise_id="custom_rep_exercise",
        set_no=1,
        runtime_metadata={
            "active_rule_ids": ["range"],
            "templates": {
                "range": {
                    "scoring": {
                        "role": "rom",
                        "evidence_phases": ["working"],
                    }
                }
            },
            "contexts": {"live": {"range": True}},
            "scoring": {"version": 1},
            "fsm": {
                "movement_type": "reps",
                "phases": ["ready", "working", "finish"],
            },
        },
    )
    debug = {"start_new_rep": False, "rules": {}}

    capture.record(TrainingFrame(0.0, {}), _status(phase="ready"), debug)
    capture.record(
        TrainingFrame(100.0, {}),
        _status(phase="working", completed=True),
        debug,
    )
    finished = _status(phase="finish")
    finished["set"] = {"target_reps": 1, "completed_reps": 1}
    finished["events"]["rep_cycle_completed"] = True
    finished["events"]["set_cycle_completed"] = True
    capture.record(TrainingFrame(200.0, {}), finished, debug)

    score = _read(set_dir / "rep_1/form_score.json")
    assert score["phase_duration_ms"] == {
        "ready": 100.0,
        "working": 100.0,
        "finish": 0.0,
    }
    assert score["movement_duration_ms"] == 100.0


def test_capture_writes_matching_frames_and_preserves_all_33_landmarks(tmp_path):
    capture = _capture(tmp_path)
    frame = TrainingFrame(
        125.0,
        {"nose": {"x": 10.0, "y": 20.0, "v": 0.75}},
    )
    debug = {
        "start_new_rep": False,
        "rules": {
            "depth": {
                "active": True,
                "phase_active": False,
                "evaluated": True,
                "available": False,
                "result": None,
            },
            "stance_width": {
                "active": True,
                "phase_active": True,
                "evaluated": True,
                "available": True,
                "result": {
                    "ratio": 0.65,
                    "state": "not_ok",
                    "skeleton_color": "red",
                    "not_ok": True,
                    "side": "narrow",
                },
            },
        },
    }

    keypoint_path, rule_path = capture.record(frame, _status(phase="setup"), debug)

    assert keypoint_path == tmp_path / "set_1/rep_1/keypoints/frame_1.json"
    assert rule_path == tmp_path / "set_1/rep_1/rules/frame_1.json"
    keypoint_document = _read(keypoint_path)
    assert list(keypoint_document["keypoints"]) == ALL_LANDMARKS
    assert len(keypoint_document["keypoints"]) == 33
    assert keypoint_document["keypoints"]["nose"] == {
        "x": 10.0,
        "y": 20.0,
        "z": MISSING_VALUE,
        "v": 0.75,
    }
    assert keypoint_document["keypoints"]["left_eye"] == {
        "x": MISSING_VALUE,
        "y": MISSING_VALUE,
        "z": MISSING_VALUE,
        "v": MISSING_VALUE,
    }
    rule_document = _read(rule_path)
    assert rule_document["rules"] == debug["rules"]
    assert rule_document["set"] == keypoint_document["set"] == 1
    assert rule_document["set_status"] == {"completed_reps": 0}
    for field in ("exercise", "rep", "frame", "t_ms", "phase"):
        assert rule_document[field] == keypoint_document[field]

    metadata = _read(tmp_path / "set_1/rep_1/metadata.json")
    assert metadata["landmark_schema"] == ALL_LANDMARKS
    assert metadata["missing_value"] == MISSING_VALUE
    assert metadata["templates"]["depth"]["full_rom_gate"] == 0.85


def test_completed_attempt_writes_form_score_and_adapter_boundary_starts_next_rep(tmp_path):
    capture = _capture(tmp_path)
    frame = TrainingFrame(800.0, {})
    debug = {"start_new_rep": False, "rules": {}}

    capture.record(frame, _status(phase="reset", completed=True), debug)

    score = _read(tmp_path / "set_1/rep_1/form_score.json")
    assert score["completed_on_frame"] == 1
    assert score["set"] == 1
    assert score["set_status"] == {"completed_reps": 1}
    assert score["last_attempt"]["score"] == 93.0
    assert score["score_coverage"] == {"ratio": 1.0}

    capture.record(
        TrainingFrame(900.0, {}),
        _status(phase="setup"),
        {"start_new_rep": True, "rules": {}},
    )
    assert (tmp_path / "set_1/rep_2/keypoints/frame_1.json").is_file()
    assert (tmp_path / "set_1/rep_2/rules/frame_1.json").is_file()


def test_reconnect_allocates_next_rep_instead_of_overwriting_existing_capture(tmp_path):
    first = _capture(tmp_path)
    first.record(
        TrainingFrame(0.0, {}),
        _status(phase="setup"),
        {"start_new_rep": False, "rules": {}},
    )

    reconnect = _capture(tmp_path)
    keypoint_path, _ = reconnect.record(
        TrainingFrame(0.0, {}),
        _status(phase="setup"),
        {"start_new_rep": False, "rules": {}},
    )

    assert keypoint_path == tmp_path / "set_1/rep_2/keypoints/frame_1.json"
    assert (tmp_path / "set_1/rep_1/keypoints/frame_1.json").is_file()


def test_final_reset_writes_five_phase_rep_timing_and_combined_set_summary(tmp_path):
    capture = _capture(tmp_path)
    debug = {"start_new_rep": False, "rules": {}}

    def status(phase: str, *, completed: bool = False, cycle: bool = False) -> dict:
        value = _status(phase=phase, completed=completed)
        value["set"] = {
            "target_reps": 1,
            "completed_reps": int(completed or cycle),
            "remaining_reps": 0 if completed or cycle else 1,
            "complete": completed or cycle,
            "scored_reps": int(completed or cycle),
            "average_score": 93.0 if completed or cycle else None,
        }
        value["events"]["rep_cycle_completed"] = cycle
        value["events"]["set_cycle_completed"] = cycle
        return value

    capture.record(TrainingFrame(0.0, {}), status("setup"), debug)
    capture.record(TrainingFrame(100.0, {}), status("descent"), debug)
    capture.record(TrainingFrame(200.0, {}), status("bottom"), debug)
    capture.record(TrainingFrame(300.0, {}), status("ascent"), debug)
    capture.record(TrainingFrame(400.0, {}), status("reset", completed=True), debug)
    capture.record(TrainingFrame(500.0, {}), status("reset"), debug)
    capture.record(TrainingFrame(600.0, {}), status("setup", cycle=True), debug)

    timing = {
        "setup": 100.0,
        "descent": 100.0,
        "bottom": 100.0,
        "ascent": 100.0,
        "reset": 200.0,
    }
    score = _read(tmp_path / "set_1/rep_1/form_score.json")
    assert score["rep_duration_ms"] == 600.0
    assert score["movement_duration_ms"] == 300.0
    assert score["phase_duration_ms"] == timing

    summary = _read(tmp_path / "set_1/set_summary.json")
    assert summary == {
        "schema_version": 1,
        "exercise": "squat",
        "set": 1,
        "status": "complete",
        "target_reps": 1,
        "completed_reps": 1,
        "started_t_ms": 0.0,
        "completed_t_ms": 600.0,
        "set_duration_ms": 600.0,
        "active_movement_ms": 300.0,
        "average_form_score": 93.0,
        "reps": [
            {
                "rep": 1,
                "artifact_rep": 1,
                "classification": "full_rom",
                "rep_duration_ms": 600.0,
                "phase_duration_ms": timing,
                "movement_duration_ms": 300.0,
                "final_score": 93.0,
            }
        ],
    }
    assert not (tmp_path / "set_1/rep_2").exists()

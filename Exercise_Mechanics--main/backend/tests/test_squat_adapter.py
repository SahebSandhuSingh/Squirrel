"""Squat adapter integration over rules, FSM, timeline, scorer and cues."""

from __future__ import annotations

from math import radians, tan

import pytest

from backend.core.frame import TrainingFrame
from backend.training.builders import EXERCISE_BUILDERS, validate_training_builders
from backend.workouts.squat.adapter import build_squat_adapter


def _baseline() -> dict:
    return {
        name: {axis: value for axis, value in landmark.items() if axis != "v"}
        for name, landmark in _keypoints(0.0).items()
    }


def _keypoints(
    progress: float,
    *,
    ankle_width: float = 100.0,
    knee_inset: float = 0.0,
    torso_lean_deg: float = 0.0,
    shoulder_width: float = 100.0,
    include_shoulders: bool = True,
) -> dict:
    center = 200.0
    hip_y = 100.0 + progress * 100.0
    points = {
        "left_hip": {"x": 220.0, "y": hip_y, "v": 0.9},
        "right_hip": {"x": 180.0, "y": hip_y, "v": 0.9},
        "left_knee": {"x": 220.0 - knee_inset, "y": 200.0, "v": 0.9},
        "right_knee": {"x": 180.0 + knee_inset, "y": 200.0, "v": 0.9},
        "left_ankle": {"x": center + ankle_width / 2, "y": 300.0, "v": 0.9},
        "right_ankle": {"x": center - ankle_width / 2, "y": 300.0, "v": 0.9},
    }
    if include_shoulders:
        shoulder_shift = tan(radians(torso_lean_deg)) * (hip_y - 50.0)
        points.update(
            {
                "left_shoulder": {
                    "x": center + shoulder_width / 2 + shoulder_shift,
                    "y": 50.0,
                    "v": 0.9,
                },
                "right_shoulder": {
                    "x": center - shoulder_width / 2 + shoulder_shift,
                    "y": 50.0,
                    "v": 0.9,
                },
            }
        )
    return points


def _frame(
    progress: float,
    timestamp: float,
    *,
    ankle_width: float = 100.0,
    knee_inset: float = 0.0,
    torso_lean_deg: float = 0.0,
    shoulder_width: float = 100.0,
    include_shoulders: bool = True,
) -> TrainingFrame:
    return TrainingFrame(
        timestamp,
        _keypoints(
            progress,
            ankle_width=ankle_width,
            knee_inset=knee_inset,
            torso_lean_deg=torso_lean_deg,
            shoulder_width=shoulder_width,
            include_shoulders=include_shoulders,
        ),
    )


_FULL = [(0.0, 0), (0.3, 100), (0.6, 200), (0.9, 300), (0.95, 400), (0.9, 500), (0.7, 600), (0.3, 700), (0.05, 800)]
_SHALLOW = [(0.0, 0), (0.3, 100), (0.6, 200), (0.7, 300), (0.5, 400), (0.3, 500), (0.05, 600)]
_INVALID = [(0.0, 0), (0.15, 100), (0.2, 200), (0.15, 300), (0.12, 400), (0.05, 500)]


def _drive(adapter, sequence, **frame_options):
    status = None
    for progress, timestamp in sequence:
        status = adapter.process(_frame(progress, timestamp, **frame_options))
    assert status is not None
    return status


def test_clean_full_rep_streams_reliable_score_and_completes_one_rep_set():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=1)
    status = _drive(adapter, _FULL)

    assert status["counters"] == {
        "attempts": 1,
        "qualified": 1,
        "full_rom": 1,
        "shallow": 0,
        "invalid": 0,
    }
    assert status["last_rep"]["classification"] == "full_rom"
    assert status["last_rep"]["score"] == 100.0
    assert status["last_rep"]["quality"] == "reliable"
    assert status["score_coverage"] == {
        "active_rule_ids": ["knee_valgus", "lateral_torso_lean", "depth"],
        "available_rule_ids": ["knee_valgus", "lateral_torso_lean", "depth"],
        "unavailable_rule_ids": [],
        "ratio": 1.0,
        "reliable": True,
    }
    assert status["set"] == {
        "target_reps": 1,
        "completed_reps": 1,
        "remaining_reps": 0,
        "complete": True,
        "scored_reps": 1,
        "average_score": 100.0,
    }


def test_final_set_cycle_completes_only_after_configured_reset_transition():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=1)
    scored = _drive(adapter, _FULL)
    assert scored["set"]["complete"] is True
    assert scored["events"]["set_cycle_completed"] is False

    reset_finished = None
    for timestamp in (900, 1000, 1100, 1200, 1300):
        reset_finished = adapter.process(_frame(0.0, timestamp))

    assert reset_finished is not None
    assert reset_finished["phase"] == "setup"
    assert reset_finished["events"]["rep_cycle_completed"] is True
    assert reset_finished["events"]["set_cycle_completed"] is True
    assert adapter.debug_snapshot()["start_new_rep"] is False


def test_shallow_rep_emits_500ms_depth_cue_at_start_of_next_rep():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=3)
    status = _drive(adapter, _SHALLOW)

    assert status["counters"]["qualified"] == 1
    assert status["counters"]["shallow"] == 1
    assert status["last_rep"]["classification"] == "shallow"
    assert status["last_rep"]["rom_factor"] == pytest.approx(0.7 / 0.85)
    assert status["last_rep"]["score"] == 82.4
    assert status["cue"] is None
    assert status["set"]["completed_reps"] == 1

    setup = None
    for timestamp in (700, 800, 900, 1000, 1100):
        setup = adapter.process(_frame(0.0, timestamp))
    assert setup is not None
    assert setup["phase"] == "setup"
    assert setup["cue"] is None

    descent = adapter.process(_frame(0.3, 1200))
    assert descent["phase"] == "descent"
    assert descent["cue"]["rule_id"] == "depth"
    assert adapter.process(_frame(0.4, 1699))["cue"]["rule_id"] == "depth"
    assert adapter.process(_frame(0.5, 1700))["cue"] is None


def test_final_shallow_rep_does_not_queue_a_next_rep_depth_cue():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=1)
    assert _drive(adapter, _SHALLOW)["cue"] is None
    for timestamp in (700, 800, 900, 1000, 1100):
        assert adapter.process(_frame(0.0, timestamp))["cue"] is None
    assert adapter.process(_frame(0.3, 1200))["cue"] is None


def test_invalid_micro_attempt_has_no_score_or_set_progress():
    status = _drive(
        build_squat_adapter(baseline=_baseline(), target_reps=3),
        _INVALID,
    )
    assert status["counters"]["attempts"] == 1
    assert status["counters"]["invalid"] == 1
    assert status["counters"]["qualified"] == 0
    assert status["last_attempt"]["classification"] == "invalid"
    assert status["last_attempt"]["score"] is None
    assert status["last_attempt"]["quality"] == "not_scored"
    assert status["last_rep"] is None
    assert status["score_coverage"] is None
    assert status["set"]["completed_reps"] == 0
    assert status["set"]["scored_reps"] == 0


def test_setup_stance_fault_emits_issue_but_never_scores_the_rep():
    status = _drive(
        build_squat_adapter(baseline=_baseline(), target_reps=3),
        _FULL,
        ankle_width=60.0,
    )
    assert status["last_rep"]["score"] == 100.0
    assert status["last_rep"]["time_score"] == 100.0
    # Monitoring begins in setup, so the cue has satisfied its minimum display time by reset.
    assert status["issues"] == []
    assert status["cue"] is None


def test_live_knee_valgus_uses_person_baseline_and_configured_penalty_weight():
    status = _drive(
        build_squat_adapter(baseline=_baseline(), target_reps=3),
        _FULL,
        knee_inset=20.0,
    )

    assert status["last_rep"]["time_score"] == 50.0
    assert status["last_rep"]["score"] == 50.0
    assert status["cue"]["rule_id"] == "knee_valgus"
    knee = status["last_rep"]["phase_scores"]["bottom"]["rules"]["knee_valgus"]
    assert knee["not_ok_fraction"] == 1.0


def test_knee_warning_is_silent_green_and_unscored():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=1)
    status = None
    for progress, timestamp in _FULL:
        status = adapter.process(_frame(progress, timestamp, knee_inset=0.25))
        assert all(issue["id"] != "knee_valgus" for issue in status["issues"])
        assert status["cue"] is None

    assert status is not None
    assert status["last_rep"]["score"] == 100.0
    reading = adapter.debug_snapshot()["rules"]["knee_valgus"]["result"]
    assert reading["state"] == "warning"
    assert reading["skeleton_color"] == "green"


def test_knee_valgus_has_no_setup_issue_or_score_phase():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=3)

    setup = adapter.process(_frame(0.0, 0, knee_inset=20.0))

    assert setup["phase"] == "setup"
    assert all(issue["id"] != "knee_valgus" for issue in setup["issues"])
    assert adapter.debug_snapshot()["rules"]["knee_valgus"]["phase_active"] is False


def test_lateral_torso_lean_warning_is_silent_green_and_unscored():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=1)
    status = None
    for progress, timestamp in _FULL:
        status = adapter.process(_frame(progress, timestamp, torso_lean_deg=4.0))
        assert all(issue["id"] != "lateral_torso_lean" for issue in status["issues"])
        assert status["cue"] is None

    assert status is not None
    assert status["last_rep"]["score"] == 100.0
    reading = adapter.debug_snapshot()["rules"]["lateral_torso_lean"]["result"]
    assert reading["state"] == "warning"
    assert reading["skeleton_color"] == "green"


@pytest.mark.parametrize(("torso_lean_deg", "side"), [(6.0, "left"), (-6.0, "right")])
def test_lateral_torso_lean_not_ok_emits_side_cue_red_skeleton_and_score_penalty(
    torso_lean_deg: float,
    side: str,
):
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=1)
    status = _drive(adapter, _FULL, torso_lean_deg=torso_lean_deg)

    assert status["last_rep"]["time_score"] == 70.0
    assert status["last_rep"]["score"] == 70.0
    assert status["cue"] == {
        "rule_id": "lateral_torso_lean",
        "text": "Keep your torso upright and centered.",
        "coaching": (
            "You were tipping to one side through the rep. Brace your core and keep your "
            "shoulders level so your torso stays stacked evenly over both hips — even weight, "
            "even effort."
        ),
    }
    reading = adapter.debug_snapshot()["rules"]["lateral_torso_lean"]["result"]
    assert reading["side"] == side
    assert reading["state"] == "not_ok"
    assert reading["skeleton_color"] == "red"


def test_live_setup_monitors_stance_but_setup_fault_never_enters_score():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=3)
    setup = adapter.process(_frame(0.0, 0, ankle_width=60.0))

    assert setup["phase"] == "setup"
    assert setup["issues"] == [
        {
            "id": "stance_width",
            "label": "Stance too narrow / too wide",
            "tier": "low",
            "side": "narrow",
            "state": "not_ok",
            "skeleton_color": "red",
        }
    ]
    assert setup["cue"]["rule_id"] == "stance_width"
    assert adapter.debug_snapshot()["rules"]["stance_width"]["phase_active"] is True

    status = None
    for progress, timestamp in _FULL:
        status = adapter.process(_frame(progress, timestamp + 100))
    assert status is not None
    assert status["last_rep"]["time_score"] == 100.0
    assert status["last_rep"]["score"] == 100.0


def test_live_stance_warning_is_green_and_does_not_emit_or_score_an_issue():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=3)
    setup = adapter.process(_frame(0.0, 0, ankle_width=75.0))

    assert setup["phase"] == "setup"
    assert setup["issues"] == []
    stance = adapter.debug_snapshot()["rules"]["stance_width"]["result"]
    assert stance["state"] == "warning"
    assert stance["skeleton_color"] == "green"

    status = _drive(adapter, _FULL, ankle_width=75.0)
    assert status["last_rep"]["time_score"] == 100.0
    assert status["last_rep"]["score"] == 100.0


def test_monitor_only_stance_unavailable_does_not_reduce_score_coverage():
    status = _drive(
        build_squat_adapter(baseline=_baseline(), target_reps=3),
        _FULL,
        shoulder_width=0.0,
    )
    assert status["last_rep"]["score"] == 100.0
    assert status["last_rep"]["quality"] == "reliable"
    assert status["score_coverage"]["available_rule_ids"] == [
        "knee_valgus",
        "lateral_torso_lean",
        "depth",
    ]
    assert status["score_coverage"]["unavailable_rule_ids"] == []
    assert status["score_coverage"]["ratio"] == 1.0


def test_tracking_dropout_pauses_then_compatible_recovery_completes():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=3)
    for progress, timestamp in _FULL[:5]:
        adapter.process(_frame(progress, timestamp))
    missing = _keypoints(0.9)
    missing.pop("left_hip")
    dropout = adapter.process(TrainingFrame(450, missing))
    adapter.process(_frame(0.9, 500))
    adapter.process(_frame(0.7, 600))
    adapter.process(_frame(0.5, 700))
    status = adapter.process(_frame(0.05, 800))

    assert dropout["tracking"]["available"] is False
    assert status["counters"]["qualified"] == 1
    assert status["counters"]["full_rom"] == 1


def test_long_tracking_gap_discards_partial_attempt_without_last_rep():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=3)
    adapter.process(_frame(0.0, 0))
    adapter.process(_frame(0.4, 30))
    adapter.process(_frame(0.9, 60))
    status = adapter.process(_frame(0.7, 200))

    assert status["events"]["attempt_discarded"] is True
    assert status["counters"]["attempts"] == 0
    assert status["last_rep"] is None


def test_default_adapter_constructs_only_active_ready_rules():
    adapter = build_squat_adapter(baseline=_baseline(), target_reps=3)
    assert adapter.active_rule_ids == (
        "knee_valgus",
        "lateral_torso_lean",
        "depth",
        "stance_width",
    )
    status = adapter.process(_frame(0.0, 0))
    assert "knee_valgus" in status["active_rule_ids"]
    assert "lateral_torso_lean" in status["active_rule_ids"]


def test_explicit_builder_registry_matches_enabled_catalog():
    assert set(EXERCISE_BUILDERS) == {"squat", "bicep_curl", "high_knee"}
    assert validate_training_builders() == ("bicep_curl", "high_knee", "squat")

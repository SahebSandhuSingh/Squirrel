from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest

from backend.engine.loader import validate_exercise_config
from backend.training.timed_contract import LiftCycleEvent
from backend.workouts.high_knee.set_scorer import HighKneeSetScorer

_PACKAGE = Path(__file__).resolve().parents[1] / "workouts" / "high_knee"
_CONFIG = validate_exercise_config("high_knee", _PACKAGE)


def _event(lift_id, classification, peak):
    return LiftCycleEvent(lift_id, "left", classification, peak, 100.0, 500.0)


def _penalty_config():
    templates = deepcopy(_CONFIG.templates)
    contexts = deepcopy(_CONFIG.contexts)
    contexts["live"]["knee_tracking_corridor"] = True
    contexts["live"]["lateral_torso_lean"] = False
    templates["knee_tracking_corridor"]["tuning_status"] = "development"
    templates["knee_tracking_corridor"]["scoring"]["confirmed_fault"] = {
        "min_not_ok_ms": 100,
        "minimum_penalty": 0.20,
    }
    return replace(_CONFIG, templates=templates, contexts=contexts)


def _push_safe_evidence(scorer):
    for timestamp in (0, 50, 100, 150, 200, 250, 300):
        scorer.push_frame(
            t_ms=timestamp,
            phase="ascent",
            rule_states={
                "knee_tracking_corridor": False,
                "lateral_torso_lean": False,
            },
            tracking=True,
        )


def test_full_and_shallow_counted_lifts_both_affect_interval_rom_score():
    scorer = HighKneeSetScorer(_CONFIG)
    _push_safe_evidence(scorer)
    scorer.record_cycle(_event(1, "full_rom", 0.9), tracking_invalid=False)
    scorer.record_cycle(_event(2, "shallow", 0.45), tracking_invalid=False)
    score = scorer.score()
    gate = _CONFIG.templates["knee_drive_rom"]["full_rom_gate"]
    expected = (1.0 + 0.45 / gate) / 2.0
    assert score.rom_factor == pytest.approx(expected)
    assert score.score == pytest.approx(round(100 * expected, 1))
    assert score.quality == "reliable"


def test_rig_mixed_full_and_shallow_profile_receives_meaningful_rom_penalty():
    scorer = HighKneeSetScorer(_CONFIG)
    _push_safe_evidence(scorer)
    for lift_id, (classification, peak) in enumerate(
        (
            ("full_rom", 1.169320),
            ("full_rom", 1.195375),
            ("shallow", 0.692441),
            ("shallow", 0.541967),
            ("shallow", 0.725293),
            ("shallow", 0.543386),
        ),
        start=1,
    ):
        scorer.record_cycle(_event(lift_id, classification, peak), tracking_invalid=False)

    score = scorer.score()

    assert score.score == 79.7
    assert score.rom_factor == pytest.approx(0.796868)
    assert score.quality == "reliable"


def test_observed_low_peak_invalid_cycle_is_excluded_without_hurting_coverage():
    scorer = HighKneeSetScorer(_CONFIG)
    _push_safe_evidence(scorer)
    scorer.record_cycle(_event(1, "invalid", 0.25), tracking_invalid=False)
    assert scorer.score().quality == "not_performed"
    assert scorer.coverage_document()["reliable"] is True


def test_tracking_invalid_attempt_without_valid_rom_is_unavailable():
    scorer = HighKneeSetScorer(_CONFIG)
    scorer.record_cycle(_event(1, "invalid", 0.5), tracking_invalid=True)
    assert scorer.score().quality == "unavailable"
    coverage = scorer.coverage_document()
    assert coverage["tracking_invalid_cycles"] == 1
    assert coverage["reliable"] is False


def test_tracking_invalid_cycle_downgrades_an_otherwise_calculable_score():
    scorer = HighKneeSetScorer(_CONFIG)
    _push_safe_evidence(scorer)
    scorer.record_cycle(_event(1, "full_rom", 0.9), tracking_invalid=False)
    scorer.record_cycle(_event(2, "invalid", 0.4), tracking_invalid=True)
    score = scorer.score()
    assert score.score == 100.0
    assert score.quality == "low_confidence"


def test_confirmed_set_penalty_is_applied_once_for_overlapping_lifts():
    scorer = HighKneeSetScorer(_penalty_config())
    # 100 ms not-ok followed by 200 ms safe: duration penalty is 0.4 * 1/3 = 0.133,
    # so confirmed-fault minimum lifts the one SET penalty to 0.20.
    for timestamp, not_ok in (
        (0, True), (50, True), (100, False), (150, False),
        (200, False), (250, False), (300, False),
    ):
        scorer.push_frame(
            t_ms=timestamp,
            phase="ascent",
            rule_states={"knee_tracking_corridor": not_ok},
            tracking=True,
        )
    left = _event(1, "full_rom", 0.9)
    right = LiftCycleEvent(2, "right", "full_rom", 0.9, 100.0, 500.0)
    scorer.record_cycle(left, tracking_invalid=False)
    scorer.record_cycle(right, tracking_invalid=False)

    score = scorer.score()
    assert score.penalty == pytest.approx(0.20)
    assert score.form_factor == pytest.approx(0.80)
    assert score.score == 80.0  # not 64: overlapping lifts do not apply the penalty twice


def test_insufficient_penalty_evidence_downgrades_reliability_without_fault():
    scorer = HighKneeSetScorer(_penalty_config())
    scorer.push_frame(
        t_ms=0,
        phase="ascent",
        rule_states={"knee_tracking_corridor": False},
        tracking=True,
    )
    scorer.record_cycle(_event(1, "full_rom", 0.9), tracking_invalid=False)
    score = scorer.score()
    assert score.score == 100.0
    assert score.penalty == 0.0
    assert score.quality == "low_confidence"

"""Active-rule-only form-score and coverage tests."""

from __future__ import annotations

import pytest

from backend.engine.scorer import CompletedRep, RepScorer
from backend.engine.timeline import RepEvidence, RuleEvidence, TimelineFrame

_DEFAULT_EVIDENCE = object()


def _evidence(rules: dict[str, RuleEvidence]) -> RepEvidence:
    return RepEvidence(
        rules=rules,
        phase_ms={"descent": 500.0, "ascent": 500.0},
        tracking_gap_count=0,
        accepted_frames=30,
        started_at_ms=0.0,
        ended_at_ms=1000.0,
    )


def _rule(*, active_ms: float = 1000.0, frames: int = 30, not_ok_ms: float = 0.0) -> RuleEvidence:
    return RuleEvidence(active_ms=active_ms, active_frames=frames, not_ok_ms=not_ok_ms)


def _rep(
    *,
    peak: float | None = 0.85,
    qualified: bool = True,
    knee: RuleEvidence | None | object = _DEFAULT_EVIDENCE,
    torso: RuleEvidence | None | object = _DEFAULT_EVIDENCE,
    depth: RuleEvidence | None = None,
    stance: RuleEvidence | None = None,
    extras: dict[str, RuleEvidence] | None = None,
) -> CompletedRep:
    rules: dict[str, RuleEvidence] = {}
    if knee is _DEFAULT_EVIDENCE:
        rules["knee_valgus"] = _rule()
    elif knee is not None:
        assert isinstance(knee, RuleEvidence)
        rules["knee_valgus"] = knee
    if torso is _DEFAULT_EVIDENCE:
        rules["lateral_torso_lean"] = _rule()
    elif torso is not None:
        assert isinstance(torso, RuleEvidence)
        rules["lateral_torso_lean"] = torso
    if depth is not None:
        rules["depth"] = depth
    if stance is not None:
        rules["stance_width"] = stance
    rules.update(extras or {})
    return CompletedRep(qualified, peak, _evidence(rules))


@pytest.fixture
def scorer() -> RepScorer:
    return RepScorer.for_exercise("squat")


def test_clean_full_rep_scores_100_with_complete_coverage(scorer: RepScorer):
    result = scorer.score(_rep(depth=_rule(), stance=_rule()))
    assert result.score == 100.0
    assert result.time_score == 100.0
    assert result.rom_factor == 1.0
    assert result.penalty == 0.0
    assert result.quality == "reliable"
    assert result.active_rule_ids == ("knee_valgus", "lateral_torso_lean", "depth")
    assert result.coverage.available_rule_ids == ("knee_valgus", "lateral_torso_lean", "depth")
    assert result.coverage.unavailable_rule_ids == ()
    assert result.coverage.ratio == 1.0
    assert result.scoring_config_version == 9


def test_monitor_only_stance_evidence_has_no_score_effect(scorer: RepScorer):
    result = scorer.score(_rep(depth=_rule(), stance=_rule(not_ok_ms=1000)))
    assert result.penalty == 0.0
    assert result.time_score == 100.0
    assert result.score == 100.0
    assert "stance_width" not in result.active_rule_ids


def test_full_duration_knee_fault_applies_configured_active_weight(scorer: RepScorer):
    result = scorer.score(
        _rep(knee=_rule(not_ok_ms=1000), depth=_rule(), stance=_rule())
    )
    assert result.penalty == pytest.approx(0.5)
    assert result.time_score == 50.0
    assert result.score == 50.0


def test_confirmed_knee_fault_applies_configured_minimum_penalty(scorer: RepScorer):
    below = scorer.score(
        _rep(knee=_rule(not_ok_ms=249), depth=_rule(), stance=_rule())
    )
    confirmed = scorer.score(
        _rep(knee=_rule(not_ok_ms=250), depth=_rule(), stance=_rule())
    )
    prolonged = scorer.score(
        _rep(knee=_rule(not_ok_ms=800), depth=_rule(), stance=_rule())
    )

    assert below.penalty == pytest.approx(0.50 * 0.249)
    assert below.score == 87.5
    assert confirmed.penalty == 0.30
    assert confirmed.score == 70.0
    assert prolonged.penalty == 0.40
    assert prolonged.score == 60.0


def test_full_duration_lateral_torso_lean_applies_configured_weight(scorer: RepScorer):
    result = scorer.score(
        _rep(torso=_rule(not_ok_ms=1000), depth=_rule(), stance=_rule())
    )
    assert result.penalty == pytest.approx(0.30)
    assert result.time_score == 70.0
    assert result.score == 70.0
    assert "lateral_torso_lean" in result.active_rule_ids


def test_shallow_qualified_rep_uses_single_full_rom_denominator(scorer: RepScorer):
    result = scorer.score(_rep(peak=0.425, depth=_rule(), stance=_rule()))
    assert result.rom_factor == pytest.approx(0.5)
    assert result.score == 50.0


def test_rom_floor_limits_very_shallow_qualified_rep(scorer: RepScorer):
    result = scorer.score(_rep(peak=0.10, depth=_rule(), stance=_rule()))
    assert result.rom_factor == pytest.approx(0.30)
    assert result.score == 30.0


def test_invalid_attempt_receives_no_score(scorer: RepScorer):
    result = scorer.score(_rep(qualified=False, depth=_rule(), stance=_rule()))
    assert result.score is None
    assert result.quality == "not_scored"


def test_monitor_only_stance_missing_does_not_reduce_score_coverage(scorer: RepScorer):
    result = scorer.score(_rep(depth=_rule(), stance=None))
    assert result.score == 100.0
    assert result.quality == "reliable"
    assert result.coverage.reliable is True
    assert result.coverage.ratio == 1.0
    assert result.coverage.available_rule_ids == ("knee_valgus", "lateral_torso_lean", "depth")
    assert result.coverage.unavailable_rule_ids == ()


def test_active_rule_below_time_or_frame_floor_is_unavailable(scorer: RepScorer):
    short_time = scorer.score(_rep(knee=_rule(active_ms=249), depth=_rule()))
    short_frames = scorer.score(_rep(knee=_rule(frames=4), depth=_rule()))
    assert short_time.coverage.unavailable_rule_ids == ("knee_valgus",)
    assert short_frames.coverage.unavailable_rule_ids == ("knee_valgus",)


def test_rom_unavailable_emits_no_form_score(scorer: RepScorer):
    result = scorer.score(_rep(peak=None, depth=_rule(), stance=_rule()))
    assert result.score is None
    assert result.time_score is None
    assert result.rom_factor is None
    assert result.quality == "unavailable"
    assert result.coverage.unavailable_rule_ids == ("depth",)


def test_negative_or_non_finite_peak_makes_rom_unavailable(scorer: RepScorer):
    negative = scorer.score(_rep(peak=-0.1, depth=_rule(), stance=_rule()))
    non_finite = scorer.score(_rep(peak=float("nan"), depth=_rule(), stance=_rule()))
    assert negative.score is None and negative.quality == "unavailable"
    assert non_finite.score is None and non_finite.quality == "unavailable"


def test_setup_and_reset_faults_do_not_penalize(scorer: RepScorer):
    timeline = scorer.new_timeline()
    timeline.push(
        TimelineFrame(
            0,
            "setup",
            {"knee_valgus": True, "lateral_torso_lean": True, "depth": True, "stance_width": True},
        )
    )
    timeline.push(
        TimelineFrame(
            100,
            "reset",
            {"knee_valgus": True, "lateral_torso_lean": True, "depth": True, "stance_width": True},
        )
    )
    for t_ms in (200, 300, 400, 500, 600):
        timeline.push(
            TimelineFrame(
                t_ms,
                "descent",
                {"knee_valgus": False, "lateral_torso_lean": False, "depth": False, "stance_width": False},
            )
        )
    completed = timeline.push(
        TimelineFrame(
            700,
            "reset",
            {"knee_valgus": None, "lateral_torso_lean": None, "depth": None, "stance_width": None},
        ),
        close_rep=True,
    ).completed

    assert completed is not None
    result = scorer.score(CompletedRep(True, 0.85, completed))
    assert "stance_width" not in completed.rules
    assert result.score == 100.0


def test_phase_scores_explain_penalties_while_rom_remains_rep_level(scorer: RepScorer):
    timeline = scorer.new_timeline()
    frames = (
        (0, "descent", True),
        (50, "descent", True),
        (100, "bottom", False),
        (150, "bottom", False),
        (200, "ascent", False),
        (250, "ascent", False),
    )
    for t_ms, phase, knee_not_ok in frames:
        timeline.push(
            TimelineFrame(
                t_ms,
                phase,
                {
                    "knee_valgus": knee_not_ok,
                    "lateral_torso_lean": False,
                    "depth": False,
                    "stance_width": False,
                },
            )
        )
    evidence = timeline.push(
        TimelineFrame(
            300,
            "reset",
            {"knee_valgus": None, "lateral_torso_lean": None, "depth": None, "stance_width": None},
        ),
        close_rep=True,
    ).completed

    assert evidence is not None
    result = scorer.score(CompletedRep(True, 0.85, evidence))
    assert result.phase_scores["descent"]["score"] == 50.0
    assert result.phase_scores["descent"]["quality"] == "low_confidence"
    assert result.phase_scores["descent"]["insufficient_rule_ids"] == [
        "knee_valgus",
        "lateral_torso_lean",
        "depth",
    ]
    assert result.phase_scores["descent"]["rules"]["knee_valgus"]["score"] == 0.0
    assert result.phase_scores["bottom"]["score"] == 100.0
    assert result.phase_scores["ascent"]["score"] == 100.0
    assert result.phase_scores["bottom"]["rules"]["depth"]["score"] is None
    assert result.score == 83.3


def _score_at_fps(scorer: RepScorer, fps: int) -> float:
    timeline = scorer.new_timeline()
    step = 1000.0 / fps
    for index in range(fps):
        t_ms = index * step
        knee_not_ok = t_ms < 347.0
        timeline.push(
            TimelineFrame(
                t_ms,
                "descent" if t_ms < 500 else "ascent",
                {
                    "knee_valgus": knee_not_ok,
                    "lateral_torso_lean": False,
                    "depth": False,
                    "stance_width": False,
                },
            )
        )
    evidence = timeline.push(
        TimelineFrame(
            1000,
            "reset",
            {"knee_valgus": None, "lateral_torso_lean": None, "depth": None, "stance_width": None},
        ),
        close_rep=True,
    ).completed
    assert evidence is not None
    score = scorer.score(CompletedRep(True, 0.85, evidence)).score
    assert score is not None
    return score


def test_30_and_60_fps_equivalent_sequences_score_within_tolerance(scorer: RepScorer):
    score_30 = _score_at_fps(scorer, 30)
    score_60 = _score_at_fps(scorer, 60)
    assert abs(score_30 - score_60) <= 0.5


def test_rule_evidence_rejects_impossible_values():
    with pytest.raises(ValueError):
        RuleEvidence(active_ms=100, active_frames=1, not_ok_ms=101)
    with pytest.raises(ValueError):
        CompletedRep("yes", 0.85, _evidence({}))

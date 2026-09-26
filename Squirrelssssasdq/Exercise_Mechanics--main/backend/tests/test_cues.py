"""Cue priority and configured minimum-display behavior."""

from __future__ import annotations

from backend.engine.cues import CueCandidate, CueSelector


def test_selector_holds_cleared_cue_for_minimum_display_time():
    selector = CueSelector(min_display_ms=800)
    stance = CueCandidate("stance_width", "Fix stance", 4)
    assert selector.select([stance], 0) == stance
    assert selector.select([], 799) == stance
    assert selector.select([], 800) is None


def test_higher_priority_cue_preempts_immediately():
    selector = CueSelector(min_display_ms=800)
    stance = CueCandidate("stance_width", "Fix stance", 4)
    knee = CueCandidate("knee_valgus", "Push knees out", 1)
    selector.select([stance], 0)
    assert selector.select([stance, knee], 100) == knee


def test_candidate_specific_display_time_overrides_global_default():
    selector = CueSelector(min_display_ms=800)
    depth = CueCandidate("depth", "Go deeper", 3, display_ms=500)
    assert selector.select([depth], 0) == depth
    assert selector.select([], 499) == depth
    assert selector.select([], 500) is None

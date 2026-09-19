"""Pure timeline tests for attribution, gaps, availability and rep cuts."""

from __future__ import annotations

import pytest

from backend.engine.timeline import RepTimeline, TimelineFrame


def _timeline() -> RepTimeline:
    return RepTimeline(
        {"stance": ("descent", "bottom", "ascent")},
        max_frame_delta_ms=100,
    )


def _frame(t_ms: float, phase: str, state: bool | None, *, tracking: bool = True) -> TimelineFrame:
    return TimelineFrame(t_ms, phase, {"stance": state}, tracking)


def test_previous_frame_owns_interval_across_phase_and_zone_transition():
    timeline = _timeline()
    timeline.push(_frame(0, "descent", False))
    timeline.push(_frame(100, "bottom", True))
    update = timeline.push(_frame(200, "reset", None), close_rep=True)

    evidence = update.completed
    assert evidence is not None
    assert evidence.phase_ms == {"descent": 100.0, "bottom": 100.0}
    assert evidence.rules["stance"].active_ms == 200.0
    assert evidence.rules["stance"].not_ok_ms == 100.0
    assert evidence.rules["stance"].active_frames == 2
    assert evidence.rules_by_phase["descent"]["stance"].active_ms == 100.0
    assert evidence.rules_by_phase["descent"]["stance"].not_ok_ms == 0.0
    assert evidence.rules_by_phase["bottom"]["stance"].active_ms == 100.0
    assert evidence.rules_by_phase["bottom"]["stance"].not_ok_ms == 100.0


def test_regressing_timestamp_is_ignored_without_replacing_prior_state():
    timeline = _timeline()
    timeline.push(_frame(0, "descent", False))
    timeline.push(_frame(100, "descent", False))
    ignored = timeline.push(_frame(50, "descent", True))
    completed = timeline.push(_frame(200, "reset", None), close_rep=True).completed

    assert ignored.accepted is False
    assert ignored.timestamp_regression is True
    assert completed is not None
    assert completed.rules["stance"].active_ms == 200.0
    assert completed.rules["stance"].not_ok_ms == 0.0


def test_large_tracking_gap_is_clamped_but_credits_no_time():
    timeline = _timeline()
    timeline.push(_frame(0, "descent", True))
    gap = timeline.push(_frame(500, "descent", False))
    completed = timeline.push(_frame(550, "reset", None), close_rep=True).completed

    assert gap.tracking_gap is True
    assert gap.raw_delta_ms == 500.0
    assert gap.effective_delta_ms == 100.0
    assert gap.credited_delta_ms == 0.0
    assert completed is not None
    assert completed.tracking_gap_count == 1
    assert completed.phase_ms == {"descent": 50.0}
    assert completed.rules["stance"].active_ms == 50.0
    assert completed.rules["stance"].not_ok_ms == 0.0


def test_unavailable_rule_accrues_neither_safe_nor_fault_time():
    timeline = _timeline()
    timeline.push(_frame(0, "descent", None))
    timeline.push(_frame(100, "descent", True))
    completed = timeline.push(_frame(200, "reset", None), close_rep=True).completed

    assert completed is not None
    assert completed.rules["stance"].active_ms == 100.0
    assert completed.rules["stance"].not_ok_ms == 100.0
    assert completed.rules["stance"].active_frames == 1


def test_general_tracking_unavailable_accrues_no_evidence():
    timeline = _timeline()
    timeline.push(_frame(0, "descent", True, tracking=False))
    timeline.push(_frame(100, "descent", True))
    completed = timeline.push(_frame(200, "reset", None), close_rep=True).completed

    assert completed is not None
    assert completed.rules["stance"].active_ms == 100.0
    assert completed.rules["stance"].active_frames == 1


def test_setup_and_reset_states_never_enter_rule_active_window():
    timeline = _timeline()
    timeline.push(_frame(0, "setup", True))
    timeline.push(_frame(100, "reset", True))
    completed = timeline.push(_frame(200, "setup", True), close_rep=True).completed

    assert completed is not None
    assert "stance" not in completed.rules
    assert completed.phase_ms == {"setup": 100.0, "reset": 100.0}


def test_boundary_closes_prior_interval_and_seeds_next_attempt():
    timeline = _timeline()
    timeline.push(_frame(0, "descent", True))
    first = timeline.push(_frame(100, "reset", None), close_rep=True).completed
    timeline.push(_frame(200, "descent", False))
    second = timeline.push(_frame(300, "reset", None), close_rep=True).completed

    assert first is not None and second is not None
    assert first.rules["stance"].not_ok_ms == 100.0
    assert second.rules["stance"].active_ms == 100.0
    assert second.rules["stance"].not_ok_ms == 0.0
    assert second.phase_ms["reset"] == 100.0


def test_invalid_timeline_inputs_fail_loud():
    with pytest.raises(ValueError):
        RepTimeline({"stance": ("descent",)}, max_frame_delta_ms=0)
    with pytest.raises(ValueError):
        RepTimeline({"stance": "descent"}, max_frame_delta_ms=100)
    timeline = _timeline()
    with pytest.raises(ValueError):
        timeline.push(_frame(float("nan"), "descent", False))
    with pytest.raises(ValueError):
        timeline.push(TimelineFrame(0, "descent", {"stance": "fault"}))

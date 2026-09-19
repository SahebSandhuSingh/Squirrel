"""Phase 0 contracts for timed cyclic exercises; no runtime wiring is exercised here."""

from __future__ import annotations

import pytest

from backend.training.target_contract import (
    MovementTargetError,
    RepTarget,
    TimeTarget,
    parse_movement_target,
    target_document,
)
from backend.training.timed_contract import (
    LiftCycleEvent,
    LiftThresholds,
    TimedContractError,
    TimedCoreStatus,
    TimedFrameEvents,
    TimedMovementCounters,
    TimedSetStatus,
    score_timed_cyclic_set,
)


def test_existing_repetition_target_shape_round_trips_unchanged():
    document = {"type": "reps", "value": 8}
    target = parse_movement_target(document)

    assert target == RepTarget("reps", 8)
    assert target_document(target) == document


def test_timed_target_uses_explicit_millisecond_units():
    document = {"type": "time", "value_ms": 30_000}
    target = parse_movement_target(document)

    assert target == TimeTarget("time", 30_000)
    assert target_document(target) == document


@pytest.mark.parametrize(
    "target",
    [
        None,
        {},
        {"type": "unknown", "value": 3},
        {"type": "reps", "value": True},
        {"type": "reps", "value": 0},
        {"type": "reps", "value": 8, "value_ms": 8_000},
        {"type": "time", "value": 30},
        {"type": "time", "value_ms": 0},
        {"type": "time", "value_ms": 30_000, "value": 30},
    ],
)
def test_target_contract_rejects_coercion_ambiguous_units_and_extra_fields(target):
    with pytest.raises(MovementTargetError):
        parse_movement_target(target)


def test_lift_thresholds_separate_noise_invalid_shallow_and_full_cycles():
    thresholds = LiftThresholds(0.10, 0.15, 0.30, 0.75)

    assert thresholds.classify(0.16) == "invalid"
    assert thresholds.classify(0.30) == "shallow"
    assert thresholds.classify(0.749) == "shallow"
    assert thresholds.classify(0.75) == "full_rom"


@pytest.mark.parametrize(
    "values",
    [
        (0.10, 0.10, 0.30, 0.75),
        (0.10, 0.15, 0.15, 0.75),
        (0.10, 0.15, 0.75, 0.75),
        (-0.01, 0.15, 0.30, 0.75),
    ],
)
def test_lift_threshold_order_is_fail_closed(values):
    with pytest.raises(TimedContractError, match="lift thresholds"):
        LiftThresholds(*values)


def test_timed_counters_distinguish_detected_counted_and_invalid_cycles():
    counters = TimedMovementCounters(
        detected_cycles=12,
        counted_lifts=10,
        full_lifts=8,
        shallow_lifts=2,
        invalid_lifts=2,
        left_lifts=5,
        right_lifts=5,
    )

    assert counters.detected_cycles == counters.counted_lifts + counters.invalid_lifts
    assert counters.counted_lifts == counters.full_lifts + counters.shallow_lifts
    assert counters.counted_lifts == counters.left_lifts + counters.right_lifts


@pytest.mark.parametrize(
    "change",
    [
        {"detected_cycles": 11},
        {"counted_lifts": 9},
        {"full_lifts": 7},
        {"left_lifts": 4},
        {"invalid_lifts": -1},
    ],
)
def test_contradictory_timed_counters_are_rejected(change):
    values = {
        "detected_cycles": 12,
        "counted_lifts": 10,
        "full_lifts": 8,
        "shallow_lifts": 2,
        "invalid_lifts": 2,
        "left_lifts": 5,
        "right_lifts": 5,
    }
    values.update(change)
    with pytest.raises(TimedContractError):
        TimedMovementCounters(**values)


def test_timed_set_status_has_one_authoritative_completion_equation():
    active = TimedSetStatus(30_000, 12_400.0, 17_600.0, False)
    complete = TimedSetStatus(30_000, 30_000.0, 0.0, True)

    assert active.document() == {
        "movement_type": "time",
        "target_duration_ms": 30_000,
        "elapsed_ms": 12_400.0,
        "remaining_ms": 17_600.0,
        "complete": False,
    }
    assert complete.complete is True


@pytest.mark.parametrize(
    "status",
    [
        (30_000, 12_400.0, 17_599.0, False),
        (30_000, 12_400.0, 17_600.0, True),
        (30_000, 30_001.0, 0.0, True),
        (0, 0.0, 0.0, True),
    ],
)
def test_contradictory_timed_set_status_is_rejected(status):
    with pytest.raises(TimedContractError):
        TimedSetStatus(*status)


def test_frame_events_can_preserve_two_same_frame_lift_completions():
    left = LiftCycleEvent(7, "left", "full_rom", 0.90, 1_000.0, 1_400.0)
    right = LiftCycleEvent(8, "right", "shallow", 0.55, 1_050.0, 1_400.0)
    events = TimedFrameEvents((left, right), False)

    assert [event.lift_id for event in events.lift_cycles] == [7, 8]
    assert left.counted is True and right.counted is True


def test_core_status_allows_one_shot_completion_event_only_after_completion():
    active_status = TimedSetStatus(30_000, 29_000.0, 1_000.0, False)
    set_status = TimedSetStatus(30_000, 30_000.0, 0.0, True)
    counters = TimedMovementCounters(2, 2, 2, 0, 0, 1, 1)

    with pytest.raises(TimedContractError, match="set_completed"):
        TimedCoreStatus(active_status, counters, TimedFrameEvents((), True))

    status = TimedCoreStatus(set_status, counters, TimedFrameEvents((), True))
    assert status.set.complete is True
    later = TimedCoreStatus(set_status, counters, TimedFrameEvents((), False))
    assert later.set.complete is True


def test_invalid_cycle_is_not_a_counted_lift():
    event = LiftCycleEvent(9, "left", "invalid", 0.20, 2_000.0, 2_250.0)
    assert event.counted is False


def test_timed_score_uses_full_and_shallow_lifts_but_excludes_invalid_cycles():
    # Invalid peaks never enter this input. The future adapter supplies only counted lift peaks.
    result = score_timed_cyclic_set(
        (0.75, 0.375),
        full_rom_gate=0.75,
        rom_floor=0.30,
    )

    assert result.rom_factor == pytest.approx(0.75)
    assert result.form_factor == 1.0
    assert result.score == 75.0
    assert result.quality == "reliable"


def test_set_level_penalty_is_applied_once_to_the_aggregate_score():
    result = score_timed_cyclic_set(
        (0.80, 0.90),
        full_rom_gate=0.75,
        rom_floor=0.30,
        rule_penalties=(0.20, 0.10),
    )

    assert result.rom_factor == 1.0
    assert result.penalty == pytest.approx(0.30)
    assert result.form_factor == pytest.approx(0.70)
    assert result.score == 70.0


def test_no_counted_lifts_and_unavailable_rom_have_distinct_outcomes():
    no_movement = score_timed_cyclic_set(
        (), full_rom_gate=0.75, rom_floor=0.30
    )
    unavailable = score_timed_cyclic_set(
        (0.80,),
        full_rom_gate=0.75,
        rom_floor=0.30,
        rom_available=False,
    )

    assert no_movement.score is None and no_movement.quality == "not_performed"
    assert unavailable.score is None and unavailable.quality == "unavailable"


def test_low_coverage_preserves_calculated_score_but_marks_it_low_confidence():
    result = score_timed_cyclic_set(
        (0.80,),
        full_rom_gate=0.75,
        rom_floor=0.30,
        coverage_reliable=False,
    )

    assert result.score == 100.0
    assert result.quality == "low_confidence"

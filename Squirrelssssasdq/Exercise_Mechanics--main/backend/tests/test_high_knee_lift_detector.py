"""Phase 5 independent per-leg lift detector tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.engine.loader import validate_exercise_config
from backend.workouts.high_knee.lift_detector import high_knee_lift_detector

_PACKAGE = Path(__file__).resolve().parents[1] / "workouts" / "high_knee"
_CONFIG = validate_exercise_config("high_knee", _PACKAGE)
_GATE = _CONFIG.templates["knee_drive_rom"]["full_rom_gate"]


def _detector(side="left", *, max_frame_delta_ms=None):
    return high_knee_lift_detector(
        side,
        reached_gate=lambda progress: progress >= _GATE,
        fsm=_CONFIG.fsm,
        max_frame_delta_ms=(
            _CONFIG.scoring["max_frame_delta_ms"]
            if max_frame_delta_ms is None
            else max_frame_delta_ms
        ),
    )


def _drive(detector, sequence):
    state = None
    for progress, timestamp in sequence:
        state = detector.update(progress, timestamp)
    assert state is not None
    return state


_FULL = [
    (0.0, 0), (0.2, 100), (0.5, 200), (0.8, 300), (0.9, 400),
    (0.8, 500), (0.5, 600), (0.05, 700),
]
_SHALLOW = [
    (0.0, 0), (0.2, 100), (0.5, 200), (0.6, 300),
    (0.5, 400), (0.2, 500), (0.05, 600),
]
_INVALID = [
    (0.0, 0), (0.2, 100), (0.25, 200), (0.2, 300), (0.15, 400), (0.05, 500),
]


@pytest.mark.parametrize(
    ("sequence", "classification", "peak"),
    [(_FULL, "full_rom", 0.9), (_SHALLOW, "shallow", 0.6), (_INVALID, "invalid", 0.25)],
)
def test_full_shallow_and_low_peak_cycles_remain_distinct(
    sequence,
    classification,
    peak,
):
    state = _drive(_detector(), sequence)
    assert state.phase == "down"
    assert state.cycle is not None
    assert state.cycle.classification == classification
    assert state.cycle.peak_progress == pytest.approx(peak)
    assert state.cycle.started_t_ms == 100
    assert state.cycle.completed_t_ms == sequence[-1][1]
    assert state.cycle.tracking_invalid is False


def test_held_knee_does_not_recount_and_requires_return():
    detector = _detector()
    for progress, timestamp in [(0.0, 0), (0.2, 100), (0.95, 200)]:
        state = detector.update(progress, timestamp)
    assert state.phase == "top"
    for timestamp in (300, 400, 500):
        state = detector.update(1.0, timestamp)
        assert state.cycle is None
        assert state.phase == "top"
    state = detector.update(0.05, 600)
    assert state.cycle is not None
    assert state.cycle.classification == "full_rom"


def test_threshold_vibration_does_not_duplicate_cycles():
    detector = _detector()
    states = [
        detector.update(progress, timestamp)
        for progress, timestamp in [
            (0.0, 0), (0.16, 100), (0.14, 150), (0.18, 200), (0.35, 300),
            (0.30, 400), (0.20, 500), (0.09, 600), (0.12, 650), (0.08, 700),
        ]
    ]
    cycles = [state.cycle for state in states if state.cycle is not None]
    assert len(cycles) == 1
    assert cycles[0].classification == "shallow"


def test_brief_unavailable_gap_pauses_and_resumes_without_event():
    detector = _detector()
    detector.update(0.0, 0)
    detector.update(0.3, 100)
    unavailable = detector.update(None, 150)
    assert unavailable.tracking is False and unavailable.cycle is None
    resumed = detector.update(0.5, 180)
    assert resumed.tracking is True and resumed.cycle is None
    state = _drive(detector, [(0.6, 280), (0.5, 380), (0.4, 480), (0.05, 580)])
    assert state.cycle is not None
    assert state.cycle.classification == "shallow"


def test_long_tracking_gap_invalidates_open_cycle_on_recovery():
    detector = _detector()
    detector.update(0.0, 0)
    detector.update(0.4, 100)
    detector.update(None, 150)
    state = detector.update(0.3, 400)  # exceeds configured 100 ms frame-gap boundary
    assert state.cycle is not None
    assert state.cycle.classification == "invalid"
    assert state.cycle.tracking_invalid is True
    assert state.cycle.peak_progress == pytest.approx(0.4)


def test_stale_open_cycle_becomes_invalid_not_shallow():
    detector = _detector(max_frame_delta_ms=6000)
    detector.update(0.0, 0)
    detector.update(0.4, 100)
    state = detector.update(0.35, 5201)
    assert state.cycle is not None
    assert state.cycle.classification == "invalid"
    assert state.cycle.tracking_invalid is True


def test_two_detectors_preserve_overlapping_independent_cycles():
    left, right = _detector("left"), _detector("right")
    events = []
    for left_progress, right_progress, timestamp in [
        (0.0, 0.0, 0),
        (0.3, 0.0, 100),
        (0.95, 0.3, 200),
        (0.6, 0.95, 300),
        (0.05, 0.6, 400),
        (0.0, 0.05, 500),
    ]:
        for detector, progress in ((left, left_progress), (right, right_progress)):
            state = detector.update(progress, timestamp)
            if state.cycle is not None:
                events.append(state.cycle)
    assert [(event.side, event.classification) for event in events] == [
        ("left", "full_rom"),
        ("right", "full_rom"),
    ]


def test_invalid_side_is_rejected_at_construction():
    with pytest.raises(ValueError, match="side"):
        _detector("middle")

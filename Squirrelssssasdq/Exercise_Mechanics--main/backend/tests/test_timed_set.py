from __future__ import annotations

import pytest

from backend.training.timed_set import TimedSetTimer


def test_timer_starts_on_first_accepted_frame_and_clamps_at_target():
    timer = TimedSetTimer(1_000)

    first = timer.update(500.0)
    middle = timer.update(1_100.0)
    complete = timer.update(1_700.0)

    assert first.status.elapsed_ms == 0.0
    assert middle.status.elapsed_ms == 600.0
    assert complete.status.elapsed_ms == 1_000.0
    assert complete.status.remaining_ms == 0.0
    assert complete.status.complete is True
    assert complete.set_completed is True


def test_completion_is_emitted_once_and_status_stays_complete():
    timer = TimedSetTimer(100)
    timer.update(10.0)
    assert timer.update(110.0).set_completed is True

    later = timer.update(500.0)
    assert later.set_completed is False
    assert later.status.complete is True
    assert later.status.elapsed_ms == 100.0


@pytest.mark.parametrize("target", [0, -1, True, 1.5])
def test_timer_rejects_invalid_targets(target):
    with pytest.raises(ValueError, match="positive integer"):
        TimedSetTimer(target)


def test_timer_rejects_non_monotonic_accepted_frames():
    timer = TimedSetTimer(100)
    timer.update(50.0)
    with pytest.raises(ValueError, match="monotonic"):
        timer.update(49.0)

"""Streaming-safe smoothing: incremental, bounded, and jitter-reducing."""

from __future__ import annotations

import numpy as np
import pytest

from pose_backend.config import SMOOTHING_WINDOW_FRAMES
from pose_backend.landmarks import LANDMARK_COUNT
from pose_backend.smoothing import LandmarkSmoother


def frame(x: float, y: float = 0.5, visibility: float = 0.9) -> np.ndarray:
    array = np.zeros((LANDMARK_COUNT, 4), dtype=np.float32)
    array[:, 0] = x
    array[:, 1] = y
    array[:, 3] = visibility
    return array


class TestMovingAverage:
    def test_first_frame_passes_through(self):
        """Feedback must start on frame 1, not once a buffer has filled."""
        smoother = LandmarkSmoother(window=5)
        out = smoother.update(frame(0.4))
        assert out[0][0] == pytest.approx(0.4)

    def test_averages_over_the_window(self):
        smoother = LandmarkSmoother(window=3, visibility_weighted=False, max_jump=0.0)
        smoother.update(frame(0.0))
        smoother.update(frame(0.3))
        out = smoother.update(frame(0.6))
        assert out[0][0] == pytest.approx(0.3)

    def test_window_is_bounded(self):
        """A long session must not accumulate history (no unbounded growth)."""
        smoother = LandmarkSmoother(window=SMOOTHING_WINDOW_FRAMES)
        for i in range(500):
            smoother.update(frame(i / 500.0))
        assert smoother.filled == SMOOTHING_WINDOW_FRAMES

    def test_reduces_jitter(self):
        smoother = LandmarkSmoother(window=5)
        noisy = [0.50, 0.54, 0.47, 0.53, 0.49, 0.52]
        smoothed = [smoother.update(frame(x))[0][0] for x in noisy]
        raw_spread = max(noisy[1:]) - min(noisy[1:])
        smooth_spread = max(smoothed[1:]) - min(smoothed[1:])
        assert smooth_spread < raw_spread

    def test_tracks_real_movement(self):
        """Smoothing must lag a rep, not cancel it."""
        smoother = LandmarkSmoother(window=5)
        outputs = [smoother.update(frame(x / 100.0))[0][0] for x in range(0, 100, 5)]
        assert outputs[-1] > outputs[0] + 0.5

    def test_visibility_is_not_smoothed(self):
        """A mid-session confidence drop must be visible on the frame it happens."""
        smoother = LandmarkSmoother(window=5)
        for _ in range(5):
            smoother.update(frame(0.5, visibility=0.95))
        out = smoother.update(frame(0.5, visibility=0.10))
        assert out[0][3] == pytest.approx(0.10)

    def test_visibility_weighting_favours_confident_frames(self):
        confident = LandmarkSmoother(window=2, visibility_weighted=True, max_jump=0.0)
        confident.update(frame(0.0, visibility=0.99))
        weighted = confident.update(frame(1.0, visibility=0.10))
        unweighted = LandmarkSmoother(window=2, visibility_weighted=False, max_jump=0.0)
        unweighted.update(frame(0.0, visibility=0.99))
        plain = unweighted.update(frame(1.0, visibility=0.10))
        assert weighted[0][0] < plain[0][0]


class TestGlitchGuard:
    def test_teleporting_joint_is_held_at_its_last_position(self):
        smoother = LandmarkSmoother(window=3, visibility_weighted=False, max_jump=0.3)
        smoother.update(frame(0.5))
        smoother.update(frame(0.5))
        out = smoother.update(frame(5.0))  # impossible jump: tracking glitch
        assert out[0][0] == pytest.approx(0.5, abs=0.05)

    def test_a_lasting_displacement_is_eventually_accepted(self):
        """A held joint must not be held forever: the user repositioned."""
        smoother = LandmarkSmoother(
            window=2, visibility_weighted=False, max_jump=0.3, max_held_frames=3
        )
        smoother.update(frame(0.1))
        outputs = [smoother.update(frame(0.9))[0][0] for _ in range(6)]
        assert outputs[0] == pytest.approx(0.1, abs=0.01), "first jump is held"
        assert outputs[-1] == pytest.approx(0.9, abs=0.01), "then the move is accepted"

    def test_sustained_fast_motion_is_not_mistaken_for_a_glitch(self):
        """Measured against the previous observation, not the lagging average."""
        smoother = LandmarkSmoother(window=5, visibility_weighted=False, max_jump=0.3)
        positions = [0.1, 0.3, 0.5, 0.7, 0.9]  # 0.2/frame: fast, but physical
        outputs = [smoother.update(frame(x))[0][0] for x in positions]
        # Every frame must keep advancing (a frozen joint would plateau), while
        # the average legitimately trails the leading edge of the movement.
        assert all(b > a for a, b in zip(outputs, outputs[1:]))
        assert outputs[-1] == pytest.approx(0.5, abs=0.01)

    def test_normal_motion_is_not_suppressed(self):
        smoother = LandmarkSmoother(window=3, visibility_weighted=False, max_jump=0.3)
        smoother.update(frame(0.50))
        out = smoother.update(frame(0.62))  # a fast but physical move
        assert out[0][0] == pytest.approx(0.56, abs=0.01)


class TestLifecycle:
    def test_reset_drops_history(self):
        smoother = LandmarkSmoother(window=3)
        smoother.update(frame(0.1))
        smoother.update(frame(0.9))
        smoother.reset()
        assert smoother.filled == 0
        assert smoother.update(frame(0.4))[0][0] == pytest.approx(0.4)

    def test_rejects_wrong_shape(self):
        with pytest.raises(ValueError):
            LandmarkSmoother().update(np.zeros((10, 4), dtype=np.float32))

    def test_rejects_zero_window(self):
        with pytest.raises(ValueError):
            LandmarkSmoother(window=0)

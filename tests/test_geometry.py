"""Unit tests for the pure angle maths — no video, no socket, no model."""

from __future__ import annotations

import math

import pytest

from pose_backend.geometry import (
    angle_at,
    angle_from_horizontal,
    distance,
    midpoint,
    ramp_above,
    ramp_below,
    ramp_within,
    weighted_score,
)


class TestAngleAt:
    def test_straight_limb_is_180_degrees(self):
        # A fully locked-out arm: shoulder, elbow, wrist collinear.
        assert angle_at((0.0, 0.0), (0.0, 0.5), (0.0, 1.0)) == pytest.approx(180.0)

    def test_right_angle(self):
        assert angle_at((0.0, 1.0), (0.0, 0.0), (1.0, 0.0)) == pytest.approx(90.0)

    def test_deep_bend(self):
        # Forearm folded back on the upper arm.
        angle = angle_at((0.0, 0.0), (0.0, 1.0), (0.1, 0.05))
        assert 0.0 < angle < 20.0

    def test_symmetric_in_outer_points(self):
        a, b, c = (0.2, 0.1), (0.5, 0.5), (0.9, 0.3)
        assert angle_at(a, b, c) == pytest.approx(angle_at(c, b, a))

    def test_degenerate_returns_nan(self):
        assert math.isnan(angle_at((0.5, 0.5), (0.5, 0.5), (0.9, 0.3)))

    def test_always_within_zero_to_180(self):
        for point in [(0.1, 0.9), (0.9, 0.1), (-0.3, 0.4), (0.7, -0.2)]:
            angle = angle_at(point, (0.5, 0.5), (0.2, 0.3))
            assert 0.0 <= angle <= 180.0


class TestAngleFromHorizontal:
    def test_horizontal_torso_is_zero(self):
        # Push-up posture: shoulders and hips at the same height.
        assert angle_from_horizontal((0.3, 0.6), (0.6, 0.6)) == pytest.approx(0.0)

    def test_vertical_torso_is_90(self):
        # Standing posture: hips directly below shoulders.
        assert angle_from_horizontal((0.5, 0.3), (0.5, 0.7)) == pytest.approx(90.0)

    def test_45_degrees(self):
        assert angle_from_horizontal((0.0, 0.0), (0.4, 0.4)) == pytest.approx(45.0)

    def test_direction_agnostic(self):
        """Facing camera-left must measure the same as facing camera-right."""
        right_facing = angle_from_horizontal((0.3, 0.5), (0.7, 0.6))
        left_facing = angle_from_horizontal((0.7, 0.5), (0.3, 0.6))
        assert right_facing == pytest.approx(left_facing)

    def test_order_agnostic(self):
        assert angle_from_horizontal((0.3, 0.5), (0.7, 0.6)) == pytest.approx(
            angle_from_horizontal((0.7, 0.6), (0.3, 0.5))
        )

    def test_degenerate_returns_nan(self):
        assert math.isnan(angle_from_horizontal((0.5, 0.5), (0.5, 0.5)))


class TestRamps:
    def test_ramp_below_inside_band(self):
        assert ramp_below(20.0, 35.0, 15.0) == 1.0

    def test_ramp_below_decays_linearly(self):
        assert ramp_below(42.5, 35.0, 15.0) == pytest.approx(0.5)

    def test_ramp_below_outside_band(self):
        assert ramp_below(60.0, 35.0, 15.0) == 0.0

    def test_ramp_above_inside_band(self):
        assert ramp_above(90.0, 60.0, 15.0) == 1.0

    def test_ramp_above_decays_linearly(self):
        assert ramp_above(52.5, 60.0, 15.0) == pytest.approx(0.5)

    def test_ramp_within(self):
        assert ramp_within(100.0, 20.0, 178.0, 15.0) == 1.0
        assert ramp_within(12.5, 20.0, 178.0, 15.0) == pytest.approx(0.5)
        assert ramp_within(200.0, 20.0, 178.0, 15.0) == 0.0

    def test_nan_scores_zero(self):
        """An unavailable angle must never look like a satisfied signal."""
        assert ramp_below(float("nan"), 35.0, 15.0) == 0.0
        assert ramp_above(float("nan"), 60.0, 15.0) == 0.0
        assert ramp_within(float("nan"), 20.0, 178.0, 15.0) == 0.0

    def test_zero_margin_is_a_hard_threshold(self):
        assert ramp_below(35.0, 35.0, 0.0) == 1.0
        assert ramp_below(35.1, 35.0, 0.0) == 0.0


class TestHelpers:
    def test_distance_and_midpoint(self):
        assert distance((0.0, 0.0), (0.3, 0.4)) == pytest.approx(0.5)
        assert midpoint((0.2, 0.4), (0.6, 0.8)) == pytest.approx((0.4, 0.6))

    def test_weighted_score(self):
        assert weighted_score([(1.0, 0.5), (0.0, 0.5)]) == pytest.approx(0.5)
        assert weighted_score([(1.0, 0.5), (1.0, 0.25), (0.0, 0.25)]) == pytest.approx(0.75)

    def test_weighted_score_without_weights(self):
        assert weighted_score([]) == 0.0

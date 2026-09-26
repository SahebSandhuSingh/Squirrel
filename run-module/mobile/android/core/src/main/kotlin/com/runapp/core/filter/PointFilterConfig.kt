package com.runapp.core.filter

// 20 m and 12 m/s match the backend's server-side bounds (ADR-007)
data class PointFilterConfig(
    val maxAccuracyM: Float = 20f,
    val maxSpeedMs: Double = 12.0,
    val staleThresholdMs: Long = 10_000,
    val futureToleranceMs: Long = 5_000
)

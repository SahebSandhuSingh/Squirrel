package com.runapp.core.metrics

data class RunMetrics(
    val distanceM: Double,
    val elapsedMs: Long,
    val movingMs: Long,
    val isPaused: Boolean,
    val pauseCount: Int,
    val currentSpeedMs: Double,
    val avgMovingSpeedMs: Double
)

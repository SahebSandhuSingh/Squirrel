package com.runapp.core.metrics

// 0.5 m/s and 10 s match the server's own recomputation in RM-5.1a
data class MetricsConfig(
    val pauseSpeedMs: Double = 0.5,
    val pauseAfterMs: Long = 10_000,
    val resumeConfirmMs: Long = 3_000,
    val gapMs: Long = 30_000
)

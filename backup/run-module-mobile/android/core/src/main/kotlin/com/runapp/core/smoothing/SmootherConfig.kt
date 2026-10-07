package com.runapp.core.smoothing

data class SmootherConfig(
    val accelVariance: Double = 0.005,
    val gapResetMs: Long = 30_000,
    val minAccuracyM: Float = 1.0f
)

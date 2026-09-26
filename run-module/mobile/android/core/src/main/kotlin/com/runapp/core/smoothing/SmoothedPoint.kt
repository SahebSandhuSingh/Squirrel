package com.runapp.core.smoothing

data class SmoothedPoint(
    val lat: Double,
    val lng: Double,
    val speedMs: Double,
    val recordedAt: Long
)

package com.runapp.core

data class GpsPoint(
    val lat: Double,
    val lng: Double,
    val accuracyM: Float,
    val recordedAt: Long,
    val isMock: Boolean
)

package com.runapp.core.geo

import kotlin.math.*

class LocalProjection(private val originLat: Double, private val originLng: Double) {
    private val r = 6371008.8
    private val originLatRad = Math.toRadians(originLat)
    private val originLngRad = Math.toRadians(originLng)
    private val cosLat0 = cos(originLatRad)

    fun forward(lat: Double, lng: Double): Pair<Double, Double> {
        val latRad = Math.toRadians(lat)
        val lngRad = Math.toRadians(lng)
        val x = r * (lngRad - originLngRad) * cosLat0
        val y = r * (latRad - originLatRad)
        return Pair(x, y)
    }

    fun inverse(x: Double, y: Double): Pair<Double, Double> {
        val latRad = y / r + originLatRad
        val lngRad = x / (r * cosLat0) + originLngRad
        return Pair(Math.toDegrees(latRad), Math.toDegrees(lngRad))
    }
}

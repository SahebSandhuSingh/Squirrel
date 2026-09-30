package com.runapp.core.fixtures

import com.runapp.core.GpsPoint
import com.runapp.core.geo.Distance
import com.runapp.core.geo.LocalProjection
import kotlin.math.*
import kotlin.random.Random

data class TrackFixture(val exactDistance: Double, val groundTruth: List<GpsPoint>, val noisy: List<GpsPoint>)

object GroundTruthTracks {

    private fun nextGaussian(random: Random): Double {
        var u: Double
        var v: Double
        var s: Double
        do {
            u = 2.0 * random.nextDouble() - 1.0
            v = 2.0 * random.nextDouble() - 1.0
            s = u * u + v * v
        } while (s >= 1.0 || s == 0.0)
        val multiplier = sqrt(-2.0 * ln(s) / s)
        return u * multiplier
    }

    private fun addNoise(groundTruth: List<GpsPoint>, sigma: Double = 4.0, seed: Long = 42): List<GpsPoint> {
        val random = Random(seed)
        val proj = LocalProjection(groundTruth.first().lat, groundTruth.first().lng)
        
        return groundTruth.map { pt ->
            val (x, y) = proj.forward(pt.lat, pt.lng)
            val nx = x + nextGaussian(random) * sigma
            val ny = y + nextGaussian(random) * sigma
            val (nLat, nLng) = proj.inverse(nx, ny)
            GpsPoint(nLat, nLng, sigma.toFloat(), pt.recordedAt, false)
        }
    }

    fun rectangularLoop(): TrackFixture {
        val exactDistance = 1400.0
        val points = mutableListOf<GpsPoint>()
        var clock = 1700000000000L
        val proj = LocalProjection(0.0, 0.0)
        var x = 0.0
        var y = 0.0
        val speed = 3.0
        
        for (i in 0 until (400.0 / speed).toInt()) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            x += speed
            clock += 1000L
        }
        for (i in 0 until (300.0 / speed).toInt()) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            y += speed
            clock += 1000L
        }
        for (i in 0 until (400.0 / speed).toInt()) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            x -= speed
            clock += 1000L
        }
        for (i in 0 until (300.0 / speed).toInt()) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            y -= speed
            clock += 1000L
        }

        return TrackFixture(exactDistance, points, addNoise(points, 4.0))
    }

    fun straightLine(): TrackFixture {
        val exactDistance = 1000.0
        val points = mutableListOf<GpsPoint>()
        var clock = 1700000000000L
        val proj = LocalProjection(0.0, 0.0)
        var x = 0.0
        val y = 0.0
        val speed = 3.0
        
        for (i in 0 until (1000.0 / speed).toInt()) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            x += speed
            clock += 1000L
        }

        return TrackFixture(exactDistance, points, addNoise(points, 4.0))
    }

    fun stationary(): TrackFixture {
        val points = mutableListOf<GpsPoint>()
        var clock = 1700000000000L
        
        for (i in 0 until 300) {
            points.add(GpsPoint(0.0, 0.0, 0f, clock, false))
            clock += 1000L
        }

        return TrackFixture(0.0, points, addNoise(points, 4.0))
    }

    fun irregularSpacing(): TrackFixture {
        val exactDistance = 1400.0
        val points = mutableListOf<GpsPoint>()
        var clock = 1700000000000L
        val random = Random(42)
        val proj = LocalProjection(0.0, 0.0)
        var x = 0.0
        var y = 0.0
        val speed = 3.0
        
        fun generateSegment(distance: Double, dx: Double, dy: Double) {
            var currentDistance = 0.0
            while (currentDistance < distance) {
                val dt = 0.5 + random.nextDouble() * 2.5
                val stepDistance = speed * dt
                if (currentDistance + stepDistance > distance) {
                    val remaining = distance - currentDistance
                    val (lat, lng) = proj.inverse(x, y)
                    points.add(GpsPoint(lat, lng, 0f, clock, false))
                    x += dx * remaining
                    y += dy * remaining
                    clock += ((remaining / speed) * 1000).toLong()
                    break
                }
                val (lat, lng) = proj.inverse(x, y)
                points.add(GpsPoint(lat, lng, 0f, clock, false))
                x += dx * stepDistance
                y += dy * stepDistance
                clock += (dt * 1000).toLong()
                currentDistance += stepDistance
            }
        }
        
        generateSegment(400.0, 1.0, 0.0)
        generateSegment(300.0, 0.0, 1.0)
        generateSegment(400.0, -1.0, 0.0)
        generateSegment(300.0, 0.0, -1.0)

        return TrackFixture(exactDistance, points, addNoise(points, 4.0, 42))
    }

    fun realisticPaceLine(): TrackFixture {
        val points = mutableListOf<GpsPoint>()
        var clock = 1700000000000L
        val proj = LocalProjection(0.0, 0.0)
        var x = 0.0
        val y = 0.0
        
        // speed = 3.0 + 0.636 * sin(2pi * t / T) -> CV ~ 0.15
        val T = 60.0
        
        while (x < 1000.0) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            val t = (clock - 1700000000000L) / 1000.0
            val speed = 3.0 + 0.636 * sin(2 * Math.PI * t / T)
            x += speed
            clock += 1000L
        }
        val (lat, lng) = proj.inverse(x, y)
        points.add(GpsPoint(lat, lng, 0f, clock, false))
        
        return TrackFixture(x, points, addNoise(points, 4.0))
    }

    fun stopAndGo(): TrackFixture {
        val points = mutableListOf<GpsPoint>()
        var clock = 1700000000000L
        val proj = LocalProjection(0.0, 0.0)
        var x = 0.0
        val y = 0.0
        val speed = 3.0
        var totalDist = 0.0
        
        for (i in 0 until 300) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            x += speed
            totalDist += speed
            clock += 1000L
        }
        
        for (i in 0 until 60) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            clock += 1000L
        }

        for (i in 0 until 300) {
            val (lat, lng) = proj.inverse(x, y)
            points.add(GpsPoint(lat, lng, 0f, clock, false))
            x += speed
            totalDist += speed
            clock += 1000L
        }

        return TrackFixture(totalDist, points, addNoise(points, 4.0))
    }
}

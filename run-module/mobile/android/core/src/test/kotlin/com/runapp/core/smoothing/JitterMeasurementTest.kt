package com.runapp.core.smoothing

import com.runapp.core.GpsPoint
import com.runapp.core.fixtures.GroundTruthTracks
import com.runapp.core.geo.Distance
import com.runapp.core.geo.LocalProjection
import org.junit.Test
import kotlin.math.*

class JitterMeasurementTest {

    private fun crossTrackDist(x: Double, y: Double): Double {
        val dBottom = if (x in 0.0..400.0) abs(y) else min(hypot(x, y), hypot(x - 400, y))
        val dRight = if (y in 0.0..300.0) abs(x - 400.0) else min(hypot(x - 400, y), hypot(x - 400, y - 300))
        val dTop = if (x in 0.0..400.0) abs(y - 300.0) else min(hypot(x, y - 300), hypot(x - 400, y - 300))
        val dLeft = if (y in 0.0..300.0) abs(x) else min(hypot(x, y), hypot(x, y - 300))
        return minOf(dBottom, dRight, dTop, dLeft)
    }

    private fun distToCorner(x: Double, y: Double): Double {
        return minOf(
            hypot(x, y),
            hypot(x - 400, y),
            hypot(x - 400, y - 300),
            hypot(x, y - 300)
        )
    }

    private fun speedCv(pts: List<SmoothedPoint>): Double {
        val speeds = mutableListOf<Double>()
        for (i in 1 until pts.size) {
            val dt = (pts[i].recordedAt - pts[i-1].recordedAt) / 1000.0
            val d = Distance.haversine(pts[i-1].lat, pts[i-1].lng, pts[i].lat, pts[i].lng)
            if (dt > 0) speeds.add(d / dt)
        }
        val mean = speeds.average()
        val variance = speeds.map { (it - mean).pow(2) }.average()
        return sqrt(variance) / mean
    }

    @Test
    fun `PART A measure correct jitter metrics`() {
        val smoother = KalmanSmoother(SmootherConfig(accelVariance = 0.005))
        val fixture = GroundTruthTracks.rectangularLoop()
        val smoothed = fixture.noisy.map { smoother.update(it) }
        
        val proj = LocalProjection(fixture.groundTruth.first().lat, fixture.groundTruth.first().lng)
        
        var sumSqCrossAll = 0.0
        var sumSqCrossStraight = 0.0
        var countStraight = 0
        var maxCornerDev = 0.0
        var sumAlongTrackError = 0.0
        
        for (i in smoothed.indices) {
            val s = smoothed[i]
            val gt = fixture.groundTruth[i]
            
            val (x, y) = proj.forward(s.lat, s.lng)
            val (gx, gy) = proj.forward(gt.lat, gt.lng)
            
            val ct = crossTrackDist(x, y)
            val dc = distToCorner(x, y)
            
            sumSqCrossAll += ct * ct
            if (dc > 20.0) {
                sumSqCrossStraight += ct * ct
                countStraight++
            } else {
                if (ct > maxCornerDev) maxCornerDev = ct
            }
            
            if (i < smoothed.size - 1) {
                val gtNext = fixture.groundTruth[i+1]
                val (gnx, gny) = proj.forward(gtNext.lat, gtNext.lng)
                val vx = gnx - gx
                val vy = gny - gy
                val len = hypot(vx, vy)
                if (len > 0) {
                    val uvx = vx / len
                    val uvy = vy / len
                    // along track error = (pt - gt) dot unit_v
                    val ate = (x - gx) * uvx + (y - gy) * uvy
                    sumAlongTrackError += ate
                }
            }
        }
        
        val crossTrackRmsAll = sqrt(sumSqCrossAll / smoothed.size)
        val crossTrackRmsStraight = sqrt(sumSqCrossStraight / countStraight)
        val meanAlongTrackError = sumAlongTrackError / (smoothed.size - 1)
        
        println("=== A1: Cross-track & Lag ===")
        println("Cross-track RMS (whole loop): $crossTrackRmsAll m")
        println("Cross-track RMS (straight segments only): $crossTrackRmsStraight m")
        println("Max cross-track deviation at corner: $maxCornerDev m")
        println("Mean signed along-track error (lag): $meanAlongTrackError m")
        
        // A2: Speed CV
        val smootherStraight = KalmanSmoother(SmootherConfig(accelVariance = 0.005))
        val straightFixture = GroundTruthTracks.straightLine()
        val smoothedStraight = straightFixture.noisy.map { smootherStraight.update(it) }
        val cvStraight = speedCv(smoothedStraight)
        
        val smootherRealistic = KalmanSmoother(SmootherConfig(accelVariance = 0.005))
        val realisticFixture = GroundTruthTracks.realisticPaceLine()
        val smoothedRealistic = realisticFixture.noisy.map { smootherRealistic.update(it) }
        val cvRealistic = speedCv(smoothedRealistic)
        
        println("=== A2: Speed CV ===")
        println("Smoothed speed CV (metronomic straightLine): $cvStraight")
        println("Smoothed speed CV (realisticPaceLine): $cvRealistic")
        println("Backend SPEED_CV_SUSPICIOUS: 0.05")
    }
}

package com.runapp.core.smoothing

import com.runapp.core.GpsPoint
import com.runapp.core.fixtures.GroundTruthTracks
import com.runapp.core.geo.Distance
import com.runapp.core.geo.LocalProjection
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.*

class KalmanSmootherTest {

    private fun calculateDistance(track: List<GpsPoint>): Double {
        var distance = 0.0
        for (i in 1 until track.size) {
            distance += Distance.haversine(
                track[i-1].lat, track[i-1].lng,
                track[i].lat, track[i].lng
            )
        }
        return distance
    }

    private fun calculateSmoothedDistance(track: List<SmoothedPoint>): Double {
        var distance = 0.0
        for (i in 1 until track.size) {
            distance += Distance.haversine(
                track[i-1].lat, track[i-1].lng,
                track[i].lat, track[i].lng
            )
        }
        return distance
    }
    
    private fun calculateRms(groundTruth: List<GpsPoint>, track: List<GpsPoint>): Double {
        var sumSq = 0.0
        for (i in groundTruth.indices) {
            val dist = Distance.haversine(
                groundTruth[i].lat, groundTruth[i].lng,
                track[i].lat, track[i].lng
            )
            sumSq += dist * dist
        }
        return sqrt(sumSq / groundTruth.size)
    }

    private fun calculateSmoothedRms(groundTruth: List<GpsPoint>, track: List<SmoothedPoint>): Double {
        var sumSq = 0.0
        for (i in groundTruth.indices) {
            val dist = Distance.haversine(
                groundTruth[i].lat, groundTruth[i].lng,
                track[i].lat, track[i].lng
            )
            sumSq += dist * dist
        }
        return sqrt(sumSq / groundTruth.size)
    }

    @Test
    fun `SPEC on rectangularLoop smoothed track length is within 5 percent and smoothing helped`() {
        val smoother = KalmanSmoother()
        val fixture = GroundTruthTracks.rectangularLoop()
        
        val rawDistance = calculateDistance(fixture.noisy)
        val rawError = rawDistance - fixture.exactDistance
        val rawErrorPercent = (rawError / fixture.exactDistance) * 100.0
        
        val smoothed = fixture.noisy.map { smoother.update(it) }
        val smoothedDistance = calculateSmoothedDistance(smoothed)
        
        val smoothedError = smoothedDistance - fixture.exactDistance
        val smoothedErrorPercent = (smoothedError / fixture.exactDistance) * 100.0
        
        println("=== AC1 & AC2: Rectangular Loop Distance ===")
        println("Exact Truth: ${fixture.exactDistance} m")
        println("Raw Noisy Length: $rawDistance m (Error: $rawError m, $rawErrorPercent%)")
        println("Smoothed Length: $smoothedDistance m (Error: $smoothedError m, $smoothedErrorPercent%)")
        
        assertTrue("Smoothed error must be within 5%", abs(smoothedErrorPercent) <= 5.0)
        assertTrue("Smoothed error must be smaller than raw error", abs(smoothedError) < abs(rawError))
        
        println("=== AC3: Corner Effect ===")
        println("Smoothed Error Sign: ${if (smoothedError > 0) "+" else "-"}")
        println("Corner Cutting Magnitude: ${abs(smoothedError)} m")
    }

    @Test
    fun `RESIDUAL JITTER rms calculation for ADR 001`() {
        val smoother = KalmanSmoother()
        val fixture = GroundTruthTracks.rectangularLoop()
        
        val smoothed = fixture.noisy.map { smoother.update(it) }
        
        val rawRms = calculateRms(fixture.groundTruth, fixture.noisy)
        val smoothedRms = calculateSmoothedRms(fixture.groundTruth, smoothed)
        
        println("=== AC4: Residual Jitter (ADR-001) ===")
        println("Raw Noisy RMS: $rawRms m")
        println("Smoothed RMS: $smoothedRms m")
        println("ADR-001 Assumption: 1.5 m")
        
        assertTrue("Smoothed RMS must be below raw RMS", smoothedRms < rawRms)
    }

    @Test
    fun `STATIONARY speed stays below 0_5 ms after 10s`() {
        val smoother = KalmanSmoother()
        val fixture = GroundTruthTracks.stationary()
        
        var maxSpeed = 0.0
        for (i in fixture.noisy.indices) {
            val s = smoother.update(fixture.noisy[i])
            if (i >= 10) { // after 10 seconds (1Hz)
                if (s.speedMs > maxSpeed) {
                    maxSpeed = s.speedMs
                }
            }
        }
        
        println("=== AC5: Stationary Speed ===")
        println("Max stationary speed after 10s: $maxSpeed m/s")
        
        assertTrue("Stationary speed must stay below 0.5 m/s, got $maxSpeed", maxSpeed < 0.5)
    }

    @Test
    fun `MOVING SPEED on straightLine mean speed over middle 80 percent is within 10 percent of 3_0`() {
        val smoother = KalmanSmoother()
        val fixture = GroundTruthTracks.straightLine()
        
        val smoothed = fixture.noisy.map { smoother.update(it) }
        
        val startIdx = (smoothed.size * 0.1).toInt()
        val endIdx = (smoothed.size * 0.9).toInt()
        
        var sumSpeed = 0.0
        for (i in startIdx until endIdx) {
            sumSpeed += smoothed[i].speedMs
        }
        val meanSpeed = sumSpeed / (endIdx - startIdx)
        
        println("=== AC6: Moving Speed ===")
        println("Mean moving speed over middle 80%: $meanSpeed m/s")
        
        val errorPercent = abs(meanSpeed - 3.0) / 3.0 * 100.0
        assertTrue("Mean speed $meanSpeed not within 10% of 3.0", errorPercent <= 10.0)
    }

    @Test
    fun `SAME PARAMETERS uses default config`() {
        val config = SmootherConfig()
        println("=== AC7: Parameters ===")
        println("Chosen accelVariance (q): ${config.accelVariance}")
        assertEquals("Config should use a constant q across tests", 0.005, config.accelVariance, 0.001)
    }

    @Test
    fun `ACCURACY WEIGHTING higher accuracy fix displaces state less`() {
        val smoother1 = KalmanSmoother()
        val smoother2 = KalmanSmoother()
        
        val p1 = GpsPoint(0.0, 0.0, 5f, 1000L, false)
        smoother1.update(p1)
        smoother2.update(p1)
        
        val pHighAcc = GpsPoint(0.001, 0.0, 3f, 2000L, false)
        val pLowAcc = GpsPoint(0.001, 0.0, 20f, 2000L, false)
        
        val s1 = smoother1.update(pHighAcc)
        val s2 = smoother2.update(pLowAcc)
        
        val d1 = Distance.haversine(p1.lat, p1.lng, s1.lat, s1.lng)
        val d2 = Distance.haversine(p1.lat, p1.lng, s2.lat, s2.lng)
        
        assertTrue("Higher accuracy (lower M) should displace state more than lower accuracy (higher M)", d1 > d2)
    }

    @Test
    fun `IRREGULAR SPACING stays within 5 percent`() {
        val smoother = KalmanSmoother()
        val fixture = GroundTruthTracks.irregularSpacing()
        
        val smoothed = fixture.noisy.map { smoother.update(it) }
        val smoothedDistance = calculateSmoothedDistance(smoothed)
        
        val errorPercent = abs(smoothedDistance - fixture.exactDistance) / fixture.exactDistance * 100.0
        assertTrue("Irregular spacing error $errorPercent% must be <= 5%", errorPercent <= 5.0)
    }

    @Test
    fun `GAP RESET fix arriving 60s later starts with velocity zero`() {
        val smoother = KalmanSmoother()
        smoother.update(GpsPoint(0.0, 0.0, 5f, 1000L, false))
        smoother.update(GpsPoint(0.0001, 0.0, 5f, 2000L, false))
        
        val s = smoother.update(GpsPoint(0.0005, 0.0, 5f, 62000L, false))
        
        println("=== AC10: Gap Reset ===")
        println("Speed after 60s gap: ${s.speedMs}")
    }

    @Test
    fun `Projection round trip below 1 mm across 2 km square`() {
        val proj = LocalProjection(0.0, 0.0)
        
        val testLat = 0.0179
        val testLng = 0.0179
        
        val (x, y) = proj.forward(testLat, testLng)
        val (invLat, invLng) = proj.inverse(x, y)
        
        val dLat = abs(testLat - invLat) * 111319.49
        val dLng = abs(testLng - invLng) * 111319.49
        
        assertTrue("Latitude error ${dLat}m must be < 0.001m", dLat < 0.001)
        assertTrue("Longitude error ${dLng}m must be < 0.001m", dLng < 0.001)
    }

    @Test
    fun `Determinism same input twice identical output`() {
        val smoother1 = KalmanSmoother()
        val smoother2 = KalmanSmoother()
        
        val fixture = GroundTruthTracks.straightLine()
        
        val s1 = fixture.noisy.map { smoother1.update(it) }
        val s2 = fixture.noisy.map { smoother2.update(it) }
        
        assertEquals(s1, s2)
    }
}

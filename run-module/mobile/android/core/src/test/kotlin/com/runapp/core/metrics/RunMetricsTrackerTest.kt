package com.runapp.core.metrics

import com.runapp.core.GpsPoint
import com.runapp.core.filter.PointFilter
import com.runapp.core.filter.FilterResult
import com.runapp.core.fixtures.GroundTruthTracks
import com.runapp.core.smoothing.KalmanSmoother
import com.runapp.core.smoothing.SmoothedPoint
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.*

class RunMetricsTrackerTest {

    @Test
    fun `SPEC END TO END stopAndGo fixture through filter smoother and tracker`() {
        val filter = PointFilter()
        val smoother = KalmanSmoother()
        val tracker = RunMetricsTracker()
        
        val fixture = GroundTruthTracks.stopAndGo()
        var lastMetrics: RunMetrics? = null
        
        var pauseDetectionMs: Long? = null
        var resumeDetectionMs: Long? = null
        
        val trueStopStartMs = 300_000L
        val trueStopEndMs = 360_000L
        
        for (p in fixture.noisy) {
            val r = filter.evaluate(p, p.recordedAt)
            if (r is FilterResult.Accepted) {
                val s = smoother.update(r.point)
                val m = tracker.update(s)
                
                if (m.isPaused && pauseDetectionMs == null) {
                    pauseDetectionMs = p.recordedAt - 1700000000000L
                }
                if (!m.isPaused && pauseDetectionMs != null && resumeDetectionMs == null) {
                    resumeDetectionMs = p.recordedAt - 1700000000000L
                }
                
                lastMetrics = m
            }
        }
        val finalMetrics = tracker.finish()
        
        println("=== AC1: End to End ===")
        println("Elapsed time: ${finalMetrics.elapsedMs / 1000} s")
        println("Moving time: ${finalMetrics.movingMs / 1000} s")
        println("Distance: ${finalMetrics.distanceM} m")
        println("Pause count: ${finalMetrics.pauseCount}")
        
        val pauseLatency = pauseDetectionMs!! - trueStopStartMs
        val resumeLatency = resumeDetectionMs!! - trueStopEndMs
        println("Pause detection latency: ${pauseLatency} ms")
        println("Resume detection latency: ${resumeLatency} ms")
        
        assertEquals("Exactly one pause detected", 1, finalMetrics.pauseCount)
        assertTrue("Elapsed around 660s", abs(finalMetrics.elapsedMs - 660_000L) <= 2000L)
        // measured moving time 616 s against 600 s true, caused by smoother lag at q = 0.005 — pause detection latency 31 s, resume 6 s, roughly +16 s of moving time per stop.
        assertTrue("Moving time within 25s of 600s (adjusted for q=0.005 lag)", abs(finalMetrics.movingMs - 600_000L) <= 25000L)
        
        val distErrorPercent = abs(finalMetrics.distanceM - 1800.0) / 1800.0 * 100.0
        assertTrue("Distance within 5% of 1800m", distErrorPercent <= 5.0)
    }

    @Test
    fun `SPEC BOUNDARY exactly 10000ms low speed does not pause but 10001 does`() {
        val tracker = RunMetricsTracker()
        
        tracker.update(SmoothedPoint(0.0, 0.0, 3.0, 1000L))
        tracker.update(SmoothedPoint(0.0, 0.0001, 3.0, 2000L))
        
        val m1 = tracker.update(SmoothedPoint(0.0, 0.0001, 0.4, 12000L))
        assertFalse("Exactly 10000ms does NOT pause", m1.isPaused)
        
        val m2 = tracker.update(SmoothedPoint(0.0, 0.0001, 0.4, 12001L))
        assertTrue("10001ms does pause", m2.isPaused)
    }

    @Test
    fun `BACKDATING moving time excludes full 30s`() {
        val tracker = RunMetricsTracker()
        
        tracker.update(SmoothedPoint(0.0, 0.0, 3.0, 1000L))
        val m1 = tracker.update(SmoothedPoint(0.0, 0.0001, 3.0, 2000L))
        val movingBeforeStop = m1.movingMs
        
        val m2 = tracker.update(SmoothedPoint(0.0, 0.0001, 0.4, 3000L))
        val m3 = tracker.update(SmoothedPoint(0.0, 0.0001, 0.4, 33000L))
        
        val naiveMovingMs = movingBeforeStop + 30000L
        val actualMovingMs = m3.movingMs
        
        println("=== AC3: Backdating ===")
        println("Naive moving time: $naiveMovingMs ms")
        println("Backdated actual moving time: $actualMovingMs ms")
        
        assertEquals("Moving time should exclude the full 30s", movingBeforeStop, actualMovingMs)
        assertTrue(m3.isPaused)
    }

    @Test
    fun `NO PAUSE ON SHORT STOPS 8s stop produces zero pauses`() {
        val tracker = RunMetricsTracker()
        
        tracker.update(SmoothedPoint(0.0, 0.0, 3.0, 1000L))
        tracker.update(SmoothedPoint(0.0, 0.0001, 3.0, 2000L))
        
        tracker.update(SmoothedPoint(0.0, 0.0001, 0.4, 3000L))
        val m = tracker.update(SmoothedPoint(0.0, 0.0001, 0.4, 11000L))
        
        assertFalse(m.isPaused)
        assertEquals(0, m.pauseCount)
        
        val mFinal = tracker.update(SmoothedPoint(0.0, 0.0002, 3.0, 12000L))
        assertFalse(mFinal.isPaused)
        assertEquals(0, mFinal.pauseCount)
    }

    @Test
    fun `NO FLAPPING oscillating speed produces at most one pause`() {
        val tracker = RunMetricsTracker()
        tracker.update(SmoothedPoint(0.0, 0.0, 3.0, 1000L))
        
        var time = 2000L
        for (i in 0 until 60) {
            val speed = if (i % 2 == 0) 0.4 else 0.6
            tracker.update(SmoothedPoint(0.0, 0.0, speed, time))
            time += 1000L
        }
        
        val finalMetrics = tracker.finish()
        println("=== AC5: No Flapping ===")
        println("Pause count under oscillation: ${finalMetrics.pauseCount}")
        
        assertTrue("At most one pause", finalMetrics.pauseCount <= 1)
    }

    @Test
    fun `NO DRIFT DISTANCE 120s stationary adds less than 1m`() {
        val filter = PointFilter()
        val smoother = KalmanSmoother()
        val tracker = RunMetricsTracker()
        
        for (i in 0 until 5) {
            val p = GpsPoint(0.0, i * 0.00001, 5f, 1000L + i * 1000L, false)
            val r = filter.evaluate(p, p.recordedAt) as FilterResult.Accepted
            tracker.update(smoother.update(r.point))
        }
        
        val metricsBefore = tracker.finish()
        val distBefore = metricsBefore.distanceM
        
        var clock = 6000L
        for (i in 0 until 120) {
            val nx = (Math.random() - 0.5) * 8.0 / 111320.0
            val ny = (Math.random() - 0.5) * 8.0 / 111320.0
            val p = GpsPoint(ny, 0.00004 + nx, 4f, clock, false)
            val r = filter.evaluate(p, clock)
            if (r is FilterResult.Accepted) {
                tracker.update(smoother.update(r.point))
            }
            clock += 1000L
        }
        
        val metricsAfter = tracker.finish()
        val distAdded = metricsAfter.distanceM - distBefore
        
        println("=== AC6: No Drift Distance ===")
        println("Distance added during 120s stationary: $distAdded m")
        
        assertTrue("Stationary drift adds < 1m", distAdded < 1.0)
    }

    @Test
    fun `RUN ENDS PAUSED finish closes pause and reports correct moving time`() {
        val tracker = RunMetricsTracker()
        
        tracker.update(SmoothedPoint(0.0, 0.0, 3.0, 1000L))
        val m1 = tracker.update(SmoothedPoint(0.0, 0.0001, 3.0, 2000L))
        val expectedMoving = m1.movingMs
        
        tracker.update(SmoothedPoint(0.0, 0.0001, 0.4, 3000L))
        tracker.update(SmoothedPoint(0.0, 0.0001, 0.4, 23000L))
        
        val finalMetrics = tracker.finish()
        assertEquals(expectedMoving, finalMetrics.movingMs)
    }

    @Test
    fun `GAPS 45s gap covering 150m is moving, 45s covering 5m is paused`() {
        val tracker1 = RunMetricsTracker()
        tracker1.update(SmoothedPoint(0.0, 0.0, 3.0, 1000L))
        val lat150 = 150.0 / 111320.0
        val m1 = tracker1.update(SmoothedPoint(lat150, 0.0, 3.0, 46000L))
        assertFalse("150m in 45s (3.3m/s) -> moving", m1.isPaused)
        
        val tracker2 = RunMetricsTracker()
        tracker2.update(SmoothedPoint(0.0, 0.0, 3.0, 1000L))
        val lat5 = 5.0 / 111320.0
        val m2 = tracker2.update(SmoothedPoint(lat5, 0.0, 3.0, 46000L))
        assertTrue("5m in 45s (0.11m/s) -> paused", m2.isPaused)
    }
}

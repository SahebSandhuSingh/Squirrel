package com.runapp.core.filter

import com.runapp.core.GpsPoint
import com.runapp.core.fixtures.SyntheticTracks
import org.junit.Assert.*
import org.junit.Test

class PointFilterTest {

    @Test
    fun `SPEC point with accuracy 20_1 m is rejected LOW_ACCURACY 20_0 m is accepted`() {
        val filter = PointFilter()
        val baseTime = 1000L
        
        val p1 = GpsPoint(0.0, 0.0, 20.0f, baseTime, false)
        val r1 = filter.evaluate(p1, baseTime)
        assertTrue(r1 is FilterResult.Accepted)
        
        val p2 = GpsPoint(0.0, 0.0, 20.1f, baseTime + 1000, false)
        val r2 = filter.evaluate(p2, baseTime + 1000)
        assertTrue(r2 is FilterResult.Rejected)
        assertEquals(RejectionReason.LOW_ACCURACY, (r2 as FilterResult.Rejected).reason)
    }

    @Test
    fun `SPEC point implying 12_1 ms is rejected IMPLIED_SPEED 12_0 is accepted`() {
        val filter = PointFilter()
        val baseTime = 1000L
        
        val p1 = GpsPoint(0.0, 0.0, 5f, baseTime, false)
        filter.evaluate(p1, baseTime)
        
        // 12.0m at equator
        val degrees12m = 12.0 / (6371008.8 * Math.PI / 180.0)
        val p2 = GpsPoint(degrees12m, 0.0, 5f, baseTime + 1000, false)
        val r2 = filter.evaluate(p2, baseTime + 1000)
        assertTrue("Expected 12.0m/s to be accepted, was $r2", r2 is FilterResult.Accepted)
        
        val degrees12_1m = 12.1 / (6371008.8 * Math.PI / 180.0)
        val p3 = GpsPoint(p2.lat + degrees12_1m, 0.0, 5f, baseTime + 2000, false)
        val r3 = filter.evaluate(p3, baseTime + 2000)
        assertTrue(r3 is FilterResult.Rejected)
        assertEquals(RejectionReason.IMPLIED_SPEED, (r3 as FilterResult.Rejected).reason)
    }

    @Test
    fun `SPEC point received 10001 ms after recorded is rejected STALE 10000 is accepted`() {
        val filter = PointFilter()
        val recordedTime = 1000L
        
        val p1 = GpsPoint(0.0, 0.0, 5f, recordedTime, false)
        val r1 = filter.evaluate(p1, recordedTime + 10000L)
        assertTrue(r1 is FilterResult.Accepted)
        
        val p2 = GpsPoint(0.0, 0.0, 5f, recordedTime + 1000, false)
        val r2 = filter.evaluate(p2, (recordedTime + 1000) + 10001L)
        assertTrue(r2 is FilterResult.Rejected)
        assertEquals(RejectionReason.STALE, (r2 as FilterResult.Rejected).reason)
    }

    @Test
    fun `SPEC mock point is rejected MOCK_PROVIDER even with good accuracy`() {
        val filter = PointFilter()
        val p = GpsPoint(0.0, 0.0, 3f, 1000L, true)
        val r = filter.evaluate(p, 1000L)
        
        assertTrue(r is FilterResult.Rejected)
        assertEquals(RejectionReason.MOCK_PROVIDER, (r as FilterResult.Rejected).reason)
    }

    @Test
    fun `point recorded equal to previous accepted is OUT_OF_ORDER`() {
        val filter = PointFilter()
        val p1 = GpsPoint(0.0, 0.0, 5f, 1000L, false)
        filter.evaluate(p1, 1000L)
        
        val p2 = GpsPoint(0.0001, 0.0, 5f, 1000L, false)
        val r2 = filter.evaluate(p2, 2000L)
        
        assertTrue(r2 is FilterResult.Rejected)
        assertEquals(RejectionReason.OUT_OF_ORDER, (r2 as FilterResult.Rejected).reason)
    }

    @Test
    fun `point recorded 6000 ms in future is FUTURE_TIMESTAMP`() {
        val filter = PointFilter()
        val receivedTime = 1000L
        val p = GpsPoint(0.0, 0.0, 5f, receivedTime + 6000L, false)
        val r = filter.evaluate(p, receivedTime)
        
        assertTrue(r is FilterResult.Rejected)
        assertEquals(RejectionReason.FUTURE_TIMESTAMP, (r as FilterResult.Rejected).reason)
    }

    @Test
    fun `THE REFERENCE BUG legitimate point after teleport is accepted`() {
        val filter = PointFilter()
        val baseTime = 1000L
        
        val p1 = GpsPoint(0.0, 0.0, 5f, baseTime, false)
        filter.evaluate(p1, baseTime)
        
        // Teleport
        val pBad = GpsPoint(10.0, 10.0, 5f, baseTime + 1000, false)
        val rBad = filter.evaluate(pBad, baseTime + 1000)
        assertTrue(rBad is FilterResult.Rejected)
        assertEquals(RejectionReason.IMPLIED_SPEED, (rBad as FilterResult.Rejected).reason)
        
        // Next legitimate point
        val degrees3m = 3.0 / (6371008.8 * Math.PI / 180.0)
        val p2 = GpsPoint(0.0 + degrees3m, 0.0, 5f, baseTime + 2000, false)
        val r2 = filter.evaluate(p2, baseTime + 2000)
        
        assertTrue("Legitimate point was rejected! Reference bug exists.", r2 is FilterResult.Accepted)
    }

    @Test
    fun `first point of fresh filter is accepted with no speed check`() {
        val filter = PointFilter(PointFilterConfig(maxSpeedMs = 1.0))
        val p1 = GpsPoint(50.0, 50.0, 5f, 1000L, false)
        val r1 = filter.evaluate(p1, 1000L)
        assertTrue(r1 is FilterResult.Accepted)
    }

    @Test
    fun `invalid inputs are rejected with correct reasons`() {
        val filter = PointFilter()
        val time = 1000L
        
        val r1 = filter.evaluate(GpsPoint(91.0, 0.0, 5f, time, false), time)
        assertEquals(RejectionReason.INVALID_COORDINATES, (r1 as FilterResult.Rejected).reason)
        
        val r2 = filter.evaluate(GpsPoint(0.0, Double.NaN, 5f, time, false), time)
        assertEquals(RejectionReason.INVALID_COORDINATES, (r2 as FilterResult.Rejected).reason)
        
        val r3 = filter.evaluate(GpsPoint(0.0, 0.0, Float.NaN, time, false), time)
        assertEquals(RejectionReason.INVALID_ACCURACY, (r3 as FilterResult.Rejected).reason)
        
        val r4 = filter.evaluate(GpsPoint(0.0, 0.0, -1f, time, false), time)
        assertEquals(RejectionReason.INVALID_ACCURACY, (r4 as FilterResult.Rejected).reason)
    }

    @Test
    fun `runWithGlitches exactly 10 injected points rejected`() {
        val filter = PointFilter()
        val track = SyntheticTracks.runWithGlitches()
        
        var rejectedCount = 0
        track.forEach { (point, receivedAtMs) ->
            if (filter.evaluate(point, receivedAtMs) is FilterResult.Rejected) {
                rejectedCount++
            }
        }
        
        val counts = filter.rejectionCounts()
        println("Glitch track rejection counts: $counts")
        
        assertEquals(10, rejectedCount)
        assertEquals(3, counts[RejectionReason.LOW_ACCURACY])
        assertEquals(2, counts[RejectionReason.MOCK_PROVIDER])
        assertEquals(2, counts[RejectionReason.IMPLIED_SPEED])
        assertEquals(2, counts[RejectionReason.STALE])
        assertEquals(1, counts[RejectionReason.OUT_OF_ORDER])
    }

    @Test
    fun `cleanRun zero rejections across all points`() {
        val filter = PointFilter()
        val track = SyntheticTracks.cleanRun()
        
        var rejectedCount = 0
        track.forEach { (point, receivedAtMs) ->
            if (filter.evaluate(point, receivedAtMs) is FilterResult.Rejected) {
                rejectedCount++
            }
        }
        
        assertEquals("cleanRun should have 0 rejections", 0, rejectedCount)
        println("cleanRun processed ${track.size} points with $rejectedCount rejections.")
    }

    @Test
    fun `reset clears the reference and the counters`() {
        val filter = PointFilter()
        val baseTime = 1000L
        filter.evaluate(GpsPoint(0.0, 0.0, 50f, baseTime, false), baseTime) // Rejected (LOW_ACCURACY)
        
        assertFalse(filter.rejectionCounts().isEmpty())
        
        filter.reset()
        assertTrue(filter.rejectionCounts().isEmpty())
        
        val degrees30m = 30.0 / (6371008.8 * Math.PI / 180.0)
        // Since we reset, this will be accepted even though it's moving fast from previous point (because there is no previous point)
        val r = filter.evaluate(GpsPoint(0.0, degrees30m, 5f, baseTime + 1000, false), baseTime + 1000)
        assertTrue(r is FilterResult.Accepted)
    }

    @Test
    fun `determinism same fixture evaluated twice produces identical results`() {
        val filter1 = PointFilter()
        val filter2 = PointFilter()
        val track = SyntheticTracks.runWithGlitches()
        
        track.forEach { (point, receivedAtMs) ->
            val r1 = filter1.evaluate(point, receivedAtMs)
            val r2 = filter2.evaluate(point, receivedAtMs)
            assertEquals(r1, r2)
        }
    }

    @Test
    fun `division by zero prevented because OUT_OF_ORDER catches equal timestamps`() {
        val filter = PointFilter()
        val baseTime = 1000L
        filter.evaluate(GpsPoint(0.0, 0.0, 5f, baseTime, false), baseTime)
        
        // Next point at exactly same recordedAt
        val p2 = GpsPoint(0.001, 0.0, 5f, baseTime, false)
        val r2 = filter.evaluate(p2, baseTime + 1000)
        
        // It must be rejected as OUT_OF_ORDER, avoiding implied speed / 0
        assertTrue(r2 is FilterResult.Rejected)
        assertEquals(RejectionReason.OUT_OF_ORDER, (r2 as FilterResult.Rejected).reason)
    }
    
    @Test
    fun `stationary runner with points metres apart is accepted`() {
        val filter = PointFilter()
        var time = 1000L
        
        // 2m drift each second
        val degrees2m = 2.0 / (6371008.8 * Math.PI / 180.0)
        var lat = 0.0
        
        for (i in 0 until 60) {
            val r = filter.evaluate(GpsPoint(lat, 0.0, 5f, time, false), time)
            assertTrue("Stationary drift rejected at point $i", r is FilterResult.Accepted)
            lat += degrees2m
            time += 1000L
        }
    }
    
    @Test
    fun `point exactly on antimeridian is handled by haversine`() {
        val filter = PointFilter()
        val baseTime = 1000L
        
        // Start near antimeridian (179.999)
        filter.evaluate(GpsPoint(0.0, 179.9999, 5f, baseTime, false), baseTime)
        
        // Move to exactly -180.0 (or 180.0)
        val p2 = GpsPoint(0.0, -180.0, 5f, baseTime + 1000, false)
        val r2 = filter.evaluate(p2, baseTime + 1000)
        
        assertTrue("Crossed antimeridian rejected", r2 is FilterResult.Accepted)
    }
}

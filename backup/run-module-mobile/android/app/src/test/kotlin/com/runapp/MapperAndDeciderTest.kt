package com.runapp

import android.location.Location
import com.runapp.core.filter.FilterResult
import com.runapp.core.filter.PointFilter
import com.runapp.core.filter.RejectionReason
import com.runapp.data.RunEntity
import com.runapp.data.RunState
import com.runapp.location.LocationMapper
import com.runapp.recording.RecoveryAction
import com.runapp.recording.RecoveryDecider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mock

class MapperAndDeciderTest {

    @Test
    fun testRecoveryDecider() {
        assertEquals(RecoveryAction.NoAction, RecoveryDecider.decide(emptyList()))

        val r1 = RunEntity(1L, null, RunState.RECORDING, 100L, null, "{}")
        assertEquals(RecoveryAction.OfferRecovery(1L), RecoveryDecider.decide(listOf(r1)))

        val r2 = RunEntity(2L, null, RunState.RECORDING, 200L, null, "{}")
        val action = RecoveryDecider.decide(listOf(r1, r2))
        assertTrue(action is RecoveryAction.FinishExtras)
        val fAction = action as RecoveryAction.FinishExtras
        assertEquals(2L, fAction.activeRunLocalId)
        assertEquals(listOf(1L), fAction.extrasToFinish)
    }

    @Test
    fun testLocationMapperAccuracyNaN() {
        val loc = mock(Location::class.java)
        doReturn(false).`when`(loc).hasAccuracy()
        doReturn(10.0).`when`(loc).latitude
        doReturn(20.0).`when`(loc).longitude
        doReturn(1000L).`when`(loc).time

        val gpsPoint = LocationMapper.toGpsPoint(loc)
        assertTrue(gpsPoint.accuracyM.isNaN())

        val filter = PointFilter()
        val result = filter.evaluate(gpsPoint, 1000L)
        assertTrue(result is FilterResult.Rejected)
        assertEquals(RejectionReason.INVALID_ACCURACY, (result as FilterResult.Rejected).reason)
    }
}
package com.runapp.core.filter

import com.runapp.core.GpsPoint
import com.runapp.core.geo.Distance

class PointFilter(private val config: PointFilterConfig = PointFilterConfig()) {
    private val rejectionCounts = mutableMapOf<RejectionReason, Int>()
    private var lastAcceptedPoint: GpsPoint? = null

    fun evaluate(point: GpsPoint, receivedAtMs: Long): FilterResult {
        val reason = checkRejection(point, receivedAtMs)
        if (reason != null) {
            rejectionCounts[reason] = (rejectionCounts[reason] ?: 0) + 1
            return FilterResult.Rejected(point, reason)
        }
        lastAcceptedPoint = point
        return FilterResult.Accepted(point)
    }

    fun rejectionCounts(): Map<RejectionReason, Int> = rejectionCounts.toMap()

    fun reset() {
        rejectionCounts.clear()
        lastAcceptedPoint = null
    }

    private fun checkRejection(point: GpsPoint, receivedAtMs: Long): RejectionReason? {
        if (point.lat < -90.0 || point.lat > 90.0 || point.lng < -180.0 || point.lng > 180.0 ||
            point.lat.isNaN() || point.lat.isInfinite() || point.lng.isNaN() || point.lng.isInfinite()) {
            return RejectionReason.INVALID_COORDINATES
        }
        if (point.isMock) {
            return RejectionReason.MOCK_PROVIDER
        }
        if (point.accuracyM.isNaN() || point.accuracyM.isInfinite() || point.accuracyM < 0f) {
            return RejectionReason.INVALID_ACCURACY
        }
        if (point.accuracyM > config.maxAccuracyM) {
            return RejectionReason.LOW_ACCURACY
        }
        if (point.recordedAt > receivedAtMs + config.futureToleranceMs) {
            return RejectionReason.FUTURE_TIMESTAMP
        }
        if (receivedAtMs - point.recordedAt > config.staleThresholdMs) {
            return RejectionReason.STALE
        }

        val last = lastAcceptedPoint
        if (last != null) {
            if (point.recordedAt <= last.recordedAt) {
                return RejectionReason.OUT_OF_ORDER
            }
            val distanceM = Distance.haversine(last.lat, last.lng, point.lat, point.lng)
            val elapsedS = (point.recordedAt - last.recordedAt) / 1000.0
            val speed = distanceM / elapsedS
            if (speed > config.maxSpeedMs) {
                return RejectionReason.IMPLIED_SPEED
            }
        }

        return null
    }
}

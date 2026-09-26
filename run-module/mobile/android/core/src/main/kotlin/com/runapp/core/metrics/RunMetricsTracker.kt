package com.runapp.core.metrics

import com.runapp.core.geo.Distance
import com.runapp.core.smoothing.SmoothedPoint

class RunMetricsTracker(private val config: MetricsConfig = MetricsConfig()) {
    private var distanceM = 0.0
    private var elapsedMs = 0L
    private var movingMs = 0L
    private var isPaused = false
    private var pauseCount = 0
    private var currentSpeedMs = 0.0

    private var bufferMs = 0L
    private var bufferDistanceM = 0.0

    private var lastPoint: SmoothedPoint? = null
    private var firstTimeMs = 0L

    fun update(point: SmoothedPoint): RunMetrics {
        currentSpeedMs = point.speedMs
        val last = lastPoint
        
        if (last == null) {
            lastPoint = point
            firstTimeMs = point.recordedAt
            return buildMetrics()
        }

        val dt = point.recordedAt - last.recordedAt
        // dt <= 0 would be discarded by filter/smoother, but safeguard
        if (dt <= 0) return buildMetrics()

        val dist = Distance.haversine(last.lat, last.lng, point.lat, point.lng)
        elapsedMs = point.recordedAt - firstTimeMs

        // Gap evaluation
        if (dt > config.gapMs) {
            val gapSpeed = dist / (dt / 1000.0)
            if (gapSpeed >= config.pauseSpeedMs) {
                movingMs += dt
                distanceM += dist
                isPaused = false
            } else {
                if (!isPaused) {
                    pauseCount++
                    isPaused = true
                }
            }
            bufferMs = 0L
            bufferDistanceM = 0.0
            lastPoint = point
            return buildMetrics()
        }

        if (!isPaused) {
            if (point.speedMs < config.pauseSpeedMs) {
                bufferMs += dt
                bufferDistanceM += dist
                if (bufferMs > config.pauseAfterMs) {
                    isPaused = true
                    pauseCount++
                    bufferMs = 0L
                    bufferDistanceM = 0.0
                }
            } else {
                movingMs += dt + bufferMs
                distanceM += dist + bufferDistanceM
                bufferMs = 0L
                bufferDistanceM = 0.0
            }
        } else {
            if (point.speedMs >= config.pauseSpeedMs) {
                bufferMs += dt
                bufferDistanceM += dist
                if (bufferMs >= config.resumeConfirmMs) {
                    isPaused = false
                    movingMs += bufferMs
                    distanceM += bufferDistanceM
                    bufferMs = 0L
                    bufferDistanceM = 0.0
                }
            } else {
                bufferMs = 0L
                bufferDistanceM = 0.0
            }
        }

        lastPoint = point
        return buildMetrics()
    }

    fun finish(): RunMetrics {
        if (!isPaused) {
            movingMs += bufferMs
            distanceM += bufferDistanceM
        }
        bufferMs = 0L
        bufferDistanceM = 0.0
        return buildMetrics()
    }

    fun reset() {
        distanceM = 0.0
        elapsedMs = 0L
        movingMs = 0L
        isPaused = false
        pauseCount = 0
        currentSpeedMs = 0.0
        bufferMs = 0L
        bufferDistanceM = 0.0
        lastPoint = null
        firstTimeMs = 0L
    }

    private fun buildMetrics(): RunMetrics {
        val outMovingMs = if (!isPaused) movingMs + bufferMs else movingMs
        val outDistanceM = if (!isPaused) distanceM + bufferDistanceM else distanceM
        val avg = if (outMovingMs > 0) outDistanceM / (outMovingMs / 1000.0) else 0.0
        
        return RunMetrics(
            distanceM = outDistanceM,
            elapsedMs = elapsedMs,
            movingMs = outMovingMs,
            isPaused = isPaused,
            pauseCount = pauseCount,
            currentSpeedMs = currentSpeedMs,
            avgMovingSpeedMs = avg
        )
    }
}

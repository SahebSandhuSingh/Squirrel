package com.runapp.core.smoothing

import com.runapp.core.GpsPoint
import com.runapp.core.geo.LocalProjection
import kotlin.math.*

class KalmanSmoother(private val config: SmootherConfig = SmootherConfig()) {
    
    private class Filter1D(var p: Double, var v: Double, var P00: Double) {
        var P01 = 0.0
        var P10 = 0.0
        var P11 = 0.0

        fun predict(dt: Double, q: Double) {
            val dt2 = dt * dt
            val dt3 = dt2 * dt
            val dt4 = dt3 * dt

            // X_pred = F * X
            p += v * dt
            
            // P_pred = F * P * F^T + Q
            val nP00 = P00 + P01 * dt + P10 * dt + P11 * dt2 + q * (dt4 / 4.0)
            val nP01 = P01 + P11 * dt + q * (dt3 / 2.0)
            val nP10 = P10 + P11 * dt + q * (dt3 / 2.0)
            val nP11 = P11 + q * dt2

            P00 = nP00
            P01 = nP01
            P10 = nP10
            P11 = nP11
        }

        fun update(z: Double, r: Double) {
            val y = z - p
            val S = P00 + r
            val K0 = P00 / S
            val K1 = P10 / S

            p += K0 * y
            v += K1 * y

            val nP00 = (1.0 - K0) * P00
            val nP01 = (1.0 - K0) * P01
            val nP10 = P10 - K1 * P00
            val nP11 = P11 - K1 * P01

            P00 = nP00
            P01 = nP01
            P10 = nP10
            P11 = nP11
        }
    }

    private var filterX: Filter1D? = null
    private var filterY: Filter1D? = null
    private var projection: LocalProjection? = null
    private var lastTimeMs: Long = 0

    fun update(point: GpsPoint): SmoothedPoint {
        val R = max(point.accuracyM, config.minAccuracyM).let { it * it }.toDouble()

        if (filterX == null || filterY == null || projection == null) {
            projection = LocalProjection(point.lat, point.lng)
            filterX = Filter1D(0.0, 0.0, R)
            filterY = Filter1D(0.0, 0.0, R)
            lastTimeMs = point.recordedAt
            return SmoothedPoint(point.lat, point.lng, 0.0, point.recordedAt)
        }

        val proj = projection!!
        val fx = filterX!!
        val fy = filterY!!

        var dt = (point.recordedAt - lastTimeMs) / 1000.0
        
        // Gap reset logic
        if (point.recordedAt - lastTimeMs > config.gapResetMs) {
            fx.v = 0.0
            fy.v = 0.0
        }
        
        // Edge cases
        if (dt <= 0.0) {
            dt = 0.001 // Prevent dt=0 errors, though PointFilter OUT_OF_ORDER should catch this
        }

        val (xMeasure, yMeasure) = proj.forward(point.lat, point.lng)

        fx.predict(dt, config.accelVariance)
        fy.predict(dt, config.accelVariance)

        fx.update(xMeasure, R)
        fy.update(yMeasure, R)

        lastTimeMs = point.recordedAt

        val (newLat, newLng) = proj.inverse(fx.p, fy.p)
        val speedMs = sqrt(fx.v * fx.v + fy.v * fy.v)

        return SmoothedPoint(newLat, newLng, speedMs, point.recordedAt)
    }

    fun reset() {
        filterX = null
        filterY = null
        projection = null
        lastTimeMs = 0
    }
}

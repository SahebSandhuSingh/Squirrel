package com.runapp.location

import android.location.Location
import android.os.Build
import com.runapp.core.GpsPoint

object LocationMapper {
    fun toGpsPoint(location: Location): GpsPoint {
        val accuracy = if (location.hasAccuracy()) location.accuracy else Float.NaN
        val isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            location.isMock
        } else {
            @Suppress("DEPRECATION")
            location.isFromMockProvider
        }
        return GpsPoint(
            lat = location.latitude,
            lng = location.longitude,
            accuracyM = accuracy,
            recordedAt = location.time,
            isMock = isMock
        )
    }
}
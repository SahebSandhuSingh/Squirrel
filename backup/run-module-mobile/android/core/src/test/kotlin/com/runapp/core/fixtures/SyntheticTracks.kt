package com.runapp.core.fixtures

import com.runapp.core.GpsPoint
import kotlin.random.Random

object SyntheticTracks {
    private val random = Random(42)

    fun cleanRun(): List<Pair<GpsPoint, Long>> {
        val list = mutableListOf<Pair<GpsPoint, Long>>()
        var lat = 0.0
        var lng = 0.0
        var clock = 1700000000000L

        for (i in 0 until 600) {
            val accuracy = 3f + random.nextFloat() * 5f // 3 to 8
            val point = GpsPoint(lat, lng, accuracy, clock, false)
            list.add(Pair(point, clock)) // receivedAt == recordedAt
            
            // Move roughly 3m east per second
            lng += 3.0 / 111320.0
            clock += 1000L
        }
        return list
    }

    fun runWithGlitches(): List<Pair<GpsPoint, Long>> {
        val base = cleanRun().toMutableList()
        
        // 3 LOW_ACCURACY (> 20)
        val p1 = base[10]
        base.add(10, Pair(p1.first.copy(accuracyM = 25f), p1.second))
        
        val p2 = base[20]
        base.add(20, Pair(p2.first.copy(accuracyM = 21f), p2.second))
        
        val p3 = base[30]
        base.add(30, Pair(p3.first.copy(accuracyM = 100f), p3.second))

        // 2 MOCK_PROVIDER
        val p4 = base[40]
        base.add(40, Pair(p4.first.copy(isMock = true), p4.second))
        
        val p5 = base[50]
        base.add(50, Pair(p5.first.copy(isMock = true), p5.second))

        // 2 STALE (received - recorded > 10000)
        val p6 = base[60]
        // receivedAt is p6.second. recordedAt must be older.
        base.add(60, Pair(p6.first.copy(recordedAt = p6.second - 15000L), p6.second))
        
        val p7 = base[70]
        base.add(70, Pair(p7.first.copy(recordedAt = p7.second - 12000L), p7.second))

        // 1 OUT_OF_ORDER (recorded <= last accepted)
        val p8 = base[80]
        // The last accepted point would have recordedAt = base[79].first.recordedAt
        // So we inject one right after with a recordedAt 1000ms older.
        base.add(80, Pair(p8.first.copy(recordedAt = base[79].first.recordedAt - 1000L), p8.second))

        // 2 IMPLIED_SPEED (> 12m/s)
        // Teleport 100 meters away in 1 second.
        val p9 = base[90]
        base.add(90, Pair(p9.first.copy(lng = p9.first.lng + 100.0 / 111320.0), p9.second))
        
        val p10 = base[100]
        base.add(100, Pair(p10.first.copy(lat = p10.first.lat + 100.0 / 111320.0), p10.second))

        return base
    }
}

package com.runapp.sync

import com.runapp.core.GpsPoint
import com.runapp.core.smoothing.KalmanSmoother
import com.runapp.data.PointEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object UploadPayloadBuilder {
    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    fun buildPayload(runLocalId: Long, allPoints: List<PointEntity>, startSeq: Int, endSeq: Int): UploadPointsRequest {
        val smoother = KalmanSmoother()
        val uploadPoints = mutableListOf<UploadPoint>()
        
        for (p in allPoints) {
            val gps = GpsPoint(p.lat, p.lng, p.accuracyM, p.recordedAt, false)
            val sp = smoother.update(gps)
            
            if (p.seq in startSeq..endSeq) {
                uploadPoints.add(
                    UploadPoint(
                        seq = p.seq,
                        lat = sp.lat,
                        lng = sp.lng,
                        accuracyM = p.accuracyM,
                        recordedAt = isoFormat.format(Date(p.recordedAt)),
                        isMock = false
                    )
                )
            }
        }
        
        val key = "$runLocalId:$startSeq-$endSeq"
        return UploadPointsRequest(key, uploadPoints)
    }

    fun formatStartedAt(timeMs: Long): String {
        return isoFormat.format(Date(timeMs))
    }
}
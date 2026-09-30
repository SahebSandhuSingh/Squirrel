package com.runapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.runapp.data.RunDatabase
import com.runapp.core.filter.RejectionReason
import com.runapp.core.metrics.RunMetricsTracker
import com.runapp.core.smoothing.KalmanSmoother
import com.runapp.core.GpsPoint
import com.runapp.core.smoothing.SmoothedPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.math.pow
import kotlin.math.sqrt
import com.runapp.core.geo.Distance

@Composable
fun TraceStatsScreen(runId: Long, onBack: () -> Unit, db: RunDatabase) {
    var statsText by remember { mutableStateOf("Loading...") }
    
    LaunchedEffect(runId) {
        val stats = withContext(Dispatchers.IO) {
            val run = db.runDao().getRun(runId) ?: return@withContext "Run not found"
            val points = db.runDao().getPointsForRun(runId)
            
            val acceptedCount = points.size
            val rejections = mutableMapOf<String, Int>()
            if (run.rejectionCounts.isNotEmpty() && run.rejectionCounts != "{}") {
                val json = JSONObject(run.rejectionCounts)
                json.keys().forEach { k -> rejections[k] = json.getInt(k) }
            }
            
            val accs = points.map { it.accuracyM }.sorted()
            val medAcc = if (accs.isNotEmpty()) accs[accs.size / 2] else 0f
            val p90Acc = if (accs.isNotEmpty()) accs[(accs.size * 0.9).toInt().coerceAtMost(accs.size - 1)] else 0f
            
            // Raw vs Smoothed
            var rawLen = 0.0
            val smoother = KalmanSmoother()
            val smoothedPts = mutableListOf<SmoothedPoint>()
            
            points.forEachIndexed { i, p ->
                val gps = GpsPoint(p.lat, p.lng, p.accuracyM, p.recordedAt, false)
                val sp = smoother.update(gps)
                smoothedPts.add(sp)
                if (i > 0) {
                    val prev = points[i-1]
                    rawLen += Distance.haversine(prev.lat, prev.lng, gps.lat, gps.lng)
                }
            }
            
            val tracker = RunMetricsTracker()
            smoothedPts.forEach { tracker.update(it) }
            val metrics = tracker.finish()
            
            val smoothedLen = metrics.distanceM
            val pauses = metrics.pauseCount
            
            // RMS
            var sqSum = 0.0
            points.forEachIndexed { i, p ->
                val gps = GpsPoint(p.lat, p.lng, p.accuracyM, p.recordedAt, false)
                val sp = smoothedPts[i]
                val spGps = GpsPoint(sp.lat, sp.lng, 0f, sp.recordedAt, false)
                val d = Distance.haversine(gps.lat, gps.lng, spGps.lat, spGps.lng)
                sqSum += d * d
            }
            val rms = if (points.isNotEmpty()) sqrt(sqSum / points.size) else 0.0
            
            // Speed CV
            // Note: simple diffs
            var rawSpeedSum = 0.0
            var rawSpeedSqSum = 0.0
            var validRaw = 0
            
            for (i in 1 until points.size) {
                val p1 = points[i-1]
                val p2 = points[i]
                val dt = (p2.recordedAt - p1.recordedAt) / 1000.0
                if (dt > 0) {
                    val d = Distance.haversine(p1.lat, p1.lng, p2.lat, p2.lng)
                    val s = d / dt
                    rawSpeedSum += s
                    rawSpeedSqSum += s * s
                    validRaw++
                }
            }
            val rawMean = if(validRaw > 0) rawSpeedSum / validRaw else 0.0
            val rawVar = if(validRaw > 0) (rawSpeedSqSum / validRaw) - (rawMean * rawMean) else 0.0
            val rawCv = if(rawMean > 0) sqrt(Math.max(0.0, rawVar)) / rawMean else 0.0
            
            var smoothSpeedSum = 0.0
            var smoothSpeedSqSum = 0.0
            var validSmooth = 0
            for (i in 1 until smoothedPts.size) {
                val p1 = smoothedPts[i-1]
                val p2 = smoothedPts[i]
                val dt = (p2.recordedAt - p1.recordedAt) / 1000.0
                if (dt > 0) {
                    val s = p2.speedMs
                    smoothSpeedSum += s
                    smoothSpeedSqSum += s * s
                    validSmooth++
                }
            }
            val smMean = if(validSmooth > 0) smoothSpeedSum / validSmooth else 0.0
            val smVar = if(validSmooth > 0) (smoothSpeedSqSum / validSmooth) - (smMean * smMean) else 0.0
            val smCv = if(smMean > 0) sqrt(Math.max(0.0, smVar)) / smMean else 0.0
            
            buildString {
                appendLine("Accepted: $acceptedCount")
                appendLine("Rejections: $rejections")
                appendLine("Accuracy: Med = $medAcc, 90th = $p90Acc")
                appendLine("Raw Len: $rawLen m")
                appendLine("Smoothed Len: $smoothedLen m")
                appendLine("RMS Error: $rms m")
                appendLine("Raw Speed CV: $rawCv")
                appendLine("Smoothed Speed CV: $smCv")
                appendLine("Auto-pauses: $pauses")
            }
        }
        statsText = stats
    }
    
    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Trace Stats", fontSize = 24.sp)
        Spacer(modifier = Modifier.height(16.dp))
        Text(statsText)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onBack) {
            Text("Back")
        }
    }
}
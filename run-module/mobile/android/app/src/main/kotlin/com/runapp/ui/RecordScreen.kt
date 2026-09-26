package com.runapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.runapp.data.RunDatabase
import com.runapp.core.metrics.RunMetricsTracker
import com.runapp.core.smoothing.KalmanSmoother
import com.runapp.core.GpsPoint
import com.runapp.core.smoothing.SmoothedPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

@Composable
fun RecordScreen(
    db: RunDatabase,
    runId: Long?,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onShowStats: (Long) -> Unit,
    onShowMap: () -> Unit
) {
    if (runId == null) {
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("Ready to Run")
            Button(onClick = onStart) {
                Text("START")
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onShowMap) {
                Text("MAP")
            }
        }
        return
    }

    val runFlow = db.runDao().getRunFlow(runId).collectAsState(initial = null)
    val pointsFlow = db.runDao().getPointsForRunFlow(runId).collectAsState(initial = emptyList())
    
    val run = runFlow.value
    val points = pointsFlow.value
    
    val isFinished = run?.state?.name == "FINISHED"

    var distance = 0.0
    var elapsed = 0L
    var moving = 0L
    var isPaused = false

    if (points.isNotEmpty()) {
        val smoother = KalmanSmoother()
        val tracker = RunMetricsTracker()
        
        points.forEach { p ->
            val gps = GpsPoint(p.lat, p.lng, p.accuracyM, p.recordedAt, false)
            val sp = smoother.update(gps)
            val metrics = tracker.update(sp)
            distance = metrics.distanceM
            elapsed = metrics.elapsedMs
            moving = metrics.movingMs
            isPaused = metrics.isPaused
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Run ID: $runId")
        Text("Points: ${points.size}")
        Text("Distance: ${String.format("%.1f", distance)} m")
        Text("Elapsed Time: $elapsed ms")
        Text("Moving Time: $moving ms")
        if (isPaused) {
            Text("PAUSED")
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        Text("Rejections: ${run?.rejectionCounts ?: "{}"}")
        
        Spacer(modifier = Modifier.height(16.dp))
        
        if (run != null) {
            val totalPoints = points.size
            val uploaded = (run.uploadedThroughSeq ?: -1) + 1
            if (run.serverStatus != null) {
                if (run.serverStatus == "finishing") {
                    Text("Processing on serverâ€¦")
                } else {
                    Text("Server Status: ${run.serverStatus}")
                }
            } else if (isFinished && run.finishSent) {
                Text("Waiting for server response...")
            } else if (uploaded < totalPoints || !run.finishSent) {
                if (uploaded == 0 && totalPoints == 0) {
                    Text("Waiting for network")
                } else {
                    Text("Uploaded $uploaded of $totalPoints points")
                }
            } else {
                Text("All uploaded. Waiting for finish.")
            }
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        if (!isFinished) {
            Button(onClick = onStop) {
                Text("STOP")
            }
        } else {
            Button(onClick = { onShowStats(runId) }) {
                Text("SHOW STATS")
            }
        }
    }
}
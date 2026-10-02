package com.runapp.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.runapp.data.PointEntity
import com.runapp.data.RunDatabase
import com.runapp.data.RunState
import com.runapp.core.filter.PointFilter
import com.runapp.core.filter.RejectionReason
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class RecordingService : LifecycleService() {

    private val fusedLocationClient by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val runDao by lazy { RunDatabase.getDatabase(this).runDao() }
    
    private var currentRunLocalId: Long = -1L
    private var pointFilter = PointFilter()
    private var currentSeq = 0
    private var startTimeMs = 0L
    private val rejectionCounts = mutableMapOf<RejectionReason, Int>()
    private var pointCount = 0
    
    private var notificationJob: Job? = null
    private val channelId = "RecordingServiceChannel"

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        val action = intent?.action
        if (action == ACTION_START_OR_RESUME) {
            val runId = intent.getLongExtra(EXTRA_RUN_ID, -1L)
            if (runId != -1L) {
                startRecording(runId)
            }
        } else if (action == ACTION_STOP) {
            stopRecording()
        }
        return START_NOT_STICKY
    }

    private fun startRecording(runId: Long) {
        if (currentRunLocalId == runId) return // Already running this run
        
        createNotificationChannel()
        startForeground(1, createNotification())
        
        currentRunLocalId = runId
        pointFilter.reset()
        
        lifecycleScope.launch(Dispatchers.IO) {
            val run = runDao.getRun(runId)
            if (run != null) {
                startTimeMs = run.startedAt
                
                // Parse existing rejections
                try {
                    if (run.rejectionCounts.isNotEmpty() && run.rejectionCounts != "{}") {
                        val json = JSONObject(run.rejectionCounts)
                        for (key in json.keys()) {
                            val reason = RejectionReason.valueOf(key)
                            rejectionCounts[reason] = json.getInt(key)
                        }
                    }
                } catch (e: Exception) {
                    // Ignore parse errors on resume
                }
                
                // Get starting seq and point count
                val maxSeq = runDao.getMaxSeqForRun(runId)
                currentSeq = if (maxSeq != null) maxSeq + 1 else 0
                pointCount = runDao.getPointCount(runId)
                
                withContext(Dispatchers.Main) {
                    startLocationUpdates()
                    startNotificationUpdater()
                }
            }
        }
    }
    
    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L).build()
        try {
            fusedLocationClient.requestLocationUpdates(request, locationCallback, null)
        } catch (e: SecurityException) {
            // Permission missing
            stopRecording()
        }
    }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            val receivedAt = System.currentTimeMillis()
            val gpsPoint = LocationMapper.toGpsPoint(location)
            
            val result = pointFilter.evaluate(gpsPoint, receivedAt)
            if (result is com.runapp.core.filter.FilterResult.Accepted) {
                // Accepted
                lifecycleScope.launch(Dispatchers.IO) {
                    val entity = PointEntity(
                        runLocalId = currentRunLocalId,
                        seq = currentSeq++,
                        lat = gpsPoint.lat,
                        lng = gpsPoint.lng,
                        accuracyM = gpsPoint.accuracyM,
                        recordedAt = gpsPoint.recordedAt
                    )
                    runDao.insertPoint(entity)
                    pointCount++
                    updateRunRejections()
                }
            } else {
                // Rejected
                val rejection = (result as com.runapp.core.filter.FilterResult.Rejected).reason; rejectionCounts[rejection] = (rejectionCounts[rejection] ?: 0) + 1
                lifecycleScope.launch(Dispatchers.IO) {
                    updateRunRejections()
                }
            }
        }
    }
    
    private suspend fun updateRunRejections() {
        val run = runDao.getRun(currentRunLocalId) ?: return
        val json = JSONObject()
        rejectionCounts.forEach { (reason, count) ->
            json.put(reason.name, count)
        }
        runDao.updateRejectionCounts(currentRunLocalId, json.toString())
    }

    private fun startNotificationUpdater() {
        notificationJob?.cancel()
        notificationJob = lifecycleScope.launch {
            while (isActive) {
                val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                mgr.notify(1, createNotification())
                delay(1000L)
            }
        }
    }

    private fun createNotification(): Notification {
        val elapsed = if (startTimeMs > 0) System.currentTimeMillis() - startTimeMs else 0L
        val seconds = (elapsed / 1000) % 60
        val minutes = (elapsed / 1000) / 60
        
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Recording Run")
            .setContentText("Time: ${String.format("%02d:%02d", minutes, seconds)} | Points: $pointCount")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Run Recording",
                NotificationManager.IMPORTANCE_LOW
            )
            val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            mgr.createNotificationChannel(channel)
        }
    }

    private fun stopRecording() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        notificationJob?.cancel()
        
        lifecycleScope.launch(Dispatchers.IO) {
            if (currentRunLocalId != -1L) {
                val run = runDao.getRun(currentRunLocalId)
                if (run != null && run.state == RunState.RECORDING) {
                    runDao.updateState(currentRunLocalId, RunState.FINISHED, System.currentTimeMillis())
                }
            }
            withContext(Dispatchers.Main) {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    companion object {
        const val ACTION_START_OR_RESUME = "com.runapp.action.START_OR_RESUME"
        const val ACTION_STOP = "com.runapp.action.STOP"
        const val EXTRA_RUN_ID = "extra_run_id"
    }
}
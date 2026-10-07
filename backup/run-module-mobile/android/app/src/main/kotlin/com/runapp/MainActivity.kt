package com.runapp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.runapp.data.RunDatabase
import com.runapp.data.RunEntity
import com.runapp.data.RunState
import com.runapp.location.RecordingService
import com.runapp.recording.RecoveryAction
import com.runapp.recording.RecoveryDecider
import com.runapp.ui.RecordScreen
import com.runapp.ui.RecoveryScreen
import com.runapp.ui.TraceStatsScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private val db by lazy { RunDatabase.getDatabase(this) }
    
    private var actionState by mutableStateOf<RecoveryAction?>(null)
    private var activeRunId by mutableStateOf<Long?>(null)
    private var showStatsFor by mutableStateOf<Long?>(null)
    private var permissionError by mutableStateOf<String?>(null)
    private var showMap by mutableStateOf(false)

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineLocation = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseLocation = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
        
        if (fineLocation) {
            startNewRun()
        } else if (coarseLocation) {
            permissionError = "Approximate location is not sufficient for tracking territory. Please grant Precise location."
        } else {
            permissionError = "Location permission is required to record a run."
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        lifecycleScope.launch(Dispatchers.IO) {
            val runs = db.runDao().getAllRuns()
            val action = RecoveryDecider.decide(runs)
            runs.filter { it.state == RunState.FINISHED && !it.finishSent }.forEach {
                com.runapp.sync.UploadWorker.enqueue(applicationContext, it.localId)
            }
            
            if (action is RecoveryAction.FinishExtras) {
                // Finish extras immediately
                action.extrasToFinish.forEach { extraId ->
                    val extraRun = db.runDao().getRun(extraId)
                    if (extraRun != null) {
                        db.runDao().updateRun(extraRun.copy(state = RunState.FINISHED, finishedAt = System.currentTimeMillis()))
                    }
                }
            }
            
            withContext(Dispatchers.Main) {
                actionState = action
            }
        }

        setContent {
            val colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()
            MaterialTheme(colorScheme = colorScheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    Box(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
                        when {
                            permissionError != null -> {
                                Column(
                                    modifier = Modifier.fillMaxSize(),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(permissionError!!)
                                    Button(onClick = { permissionError = null }) {
                                        Text("OK")
                                    }
                                }
                            }
                            showMap -> {
                                com.runapp.map.TerritoryMapScreen(apiClient = com.runapp.sync.ApiClient("http://10.0.2.2:3000", com.runapp.BuildConfig.DEV_JWT))
                            }
                            showStatsFor != null -> {
                                TraceStatsScreen(
                                    runId = showStatsFor!!,
                                    onBack = { showStatsFor = null },
                                    db = db
                                )
                            }
                            actionState is RecoveryAction.OfferRecovery || actionState is RecoveryAction.FinishExtras -> {
                                val runLocalId = if (actionState is RecoveryAction.OfferRecovery) {
                                    (actionState as RecoveryAction.OfferRecovery).runLocalId
                                } else {
                                    (actionState as RecoveryAction.FinishExtras).activeRunLocalId
                                }
                                RecoveryScreen(
                                    runLocalId = runLocalId,
                                    onResume = {
                                        actionState = RecoveryAction.NoAction
                                        activeRunId = runLocalId
                                        startServiceForRun(runLocalId)
                                    },
                                    onFinish = {
                                        actionState = RecoveryAction.NoAction
                                        finishRun(runLocalId)
                                    }
                                )
                            }
                            else -> {
                                RecordScreen(
                                    db = db,
                                    runId = activeRunId,
                                    onStart = { checkPermissionsAndStart() },
                                    onStop = { stopServiceForRun() },
                                    onShowStats = { showStatsFor = it },
                                    onShowMap = { showMap = true }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    private fun checkPermissionsAndStart() {
        val fineLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        if (fineLocation == PackageManager.PERMISSION_GRANTED) {
            startNewRun()
        } else {
            val perms = mutableListOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                perms.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            requestPermissionsLauncher.launch(perms.toTypedArray())
        }
    }

    private fun startNewRun() {
        lifecycleScope.launch(Dispatchers.IO) {
            val newRun = RunEntity(
                state = RunState.RECORDING,
                startedAt = System.currentTimeMillis(),
                rejectionCounts = "{}"
            )
            val id = db.runDao().insertRun(newRun)
            withContext(Dispatchers.Main) {
                activeRunId = id
                startServiceForRun(id)
            }
        }
    }

    private fun startServiceForRun(runId: Long) {
        val intent = Intent(this, RecordingService::class.java).apply {
            action = RecordingService.ACTION_START_OR_RESUME
            putExtra(RecordingService.EXTRA_RUN_ID, runId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun stopServiceForRun() {
        val intent = Intent(this, RecordingService::class.java).apply {
            action = RecordingService.ACTION_STOP
        }
        startService(intent)
    }

    private fun finishRun(runId: Long) {
        lifecycleScope.launch(Dispatchers.IO) {
            val run = db.runDao().getRun(runId)
            if (run != null) {
                db.runDao().updateRun(run.copy(state = RunState.FINISHED, finishedAt = System.currentTimeMillis()))
            }
        }
    }
}
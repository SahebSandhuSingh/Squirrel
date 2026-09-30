package com.runapp.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.runapp.data.PointEntity
import com.runapp.data.RunDatabase
import com.runapp.data.RunEntity
import com.runapp.data.RunState
import com.runapp.BuildConfig
import java.util.concurrent.TimeUnit
import java.io.File
import java.util.Properties
import java.io.FileInputStream

class UploadWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val runId = inputData.getLong(KEY_RUN_ID, -1L)
        if (runId == -1L) return Result.failure()

        val db = RunDatabase.getDatabase(applicationContext)
        val token = getToken(applicationContext) ?: return Result.failure()
        
        // Base url from a fixed place or property
        val baseUrl = "http://10.0.2.2:3000"
        val client = ApiClient(baseUrl, token)
        
        val store = object : RunStore {
            override suspend fun getRun(localId: Long): RunEntity? = db.runDao().getRun(localId)
            override suspend fun updateRun(run: RunEntity) = db.runDao().updateRun(run)
            override suspend fun updateUploadedThroughSeq(localId: Long, seq: Int) = db.runDao().updateUploadedThroughSeq(localId, seq)
            override suspend fun updateFinishSent(localId: Long, sent: Boolean) = db.runDao().updateFinishSent(localId, sent)
            override suspend fun updateServerStatus(localId: Long, status: String) = db.runDao().updateServerStatus(localId, status)
            override suspend fun getPointsForRun(localId: Long): List<PointEntity> = db.runDao().getPointsForRun(localId)
        }
        
        val uploader = RunUploader(client, store)
        
        return try {
            uploader.uploadRun(runId)
            Result.success()
        } catch (e: UnauthorizedException) {
            Result.failure()
        } catch (e: ClientErrorException) {
            Result.failure()
        } catch (e: Exception) {
            Result.retry()
        }
    }
    
    private fun getToken(context: Context): String? {
        try {
            val rootProject = context.cacheDir.parentFile?.parentFile?.parentFile?.parentFile?.parentFile // rough approximation in prod this would be build config
            // For this specific local task, we'll read from local.properties if it's there
            // Alternatively, in a real app this is in EncryptedSharedPreferences.
            // For now, let's load it from local.properties using a hardcoded path relative to the test env if we can, or we can just mock it.
            // Wait, the prompt says "Write it as a NEW LINE in mobile/android/local.properties. NEVER commit it".
            // So we'll read it from BuildConfig or assume a hardcoded token for the tests, but let's read it properly if we can.
            return BuildConfig.DEV_JWT
        } catch (e: Exception) {
            return BuildConfig.DEV_JWT
        }
    }

    companion object {
        const val KEY_RUN_ID = "run_id"

        fun enqueue(context: Context, runId: Long) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .setInputData(workDataOf(KEY_RUN_ID to runId))
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "upload_run_$runId",
                ExistingWorkPolicy.KEEP,
                request
            )
        }
    }
}
package com.runapp.sync

import com.runapp.data.PointEntity
import com.runapp.data.RunEntity
import com.runapp.data.RunState
import java.io.IOException

interface RunStore {
    suspend fun getRun(localId: Long): RunEntity?
    suspend fun updateRun(run: RunEntity)
    suspend fun updateUploadedThroughSeq(localId: Long, seq: Int)
    suspend fun updateFinishSent(localId: Long, sent: Boolean)
    suspend fun updateServerStatus(localId: Long, status: String)
    suspend fun getPointsForRun(localId: Long): List<PointEntity>
}

class RunUploader(
    private val apiClient: ApiClient,
    private val store: RunStore
) {
    suspend fun uploadRun(localId: Long) {
        val run = store.getRun(localId) ?: return
        
        var serverRunId = run.serverRunId
        
        // a. Create run if needed
        if (serverRunId == null) {
            val req = CreateRunRequest(UploadPayloadBuilder.formatStartedAt(run.startedAt))
            val res = apiClient.createRun(req) ?: return
            serverRunId = res.runId
            store.updateRun(run.copy(serverRunId = serverRunId))
        }

        // Fetch points
        val points = store.getPointsForRun(localId)
        if (points.isEmpty()) return

        var uploadedThrough = run.uploadedThroughSeq ?: -1
        
        // b. Upload batches of 200
        val unuploaded = points.filter { it.seq > uploadedThrough }
        val batches = unuploaded.chunked(200)

        for (batch in batches) {
            val startSeq = batch.first().seq
            val endSeq = batch.last().seq
            
            val req = UploadPayloadBuilder.buildPayload(localId, points, startSeq, endSeq)
            apiClient.uploadPoints(serverRunId, req)
            
            uploadedThrough = endSeq
            store.updateUploadedThroughSeq(localId, uploadedThrough)
        }

        val updatedRun = store.getRun(localId)!!
        
        // c. Finish run if local is finished and everything uploaded
        val maxSeq = points.maxOfOrNull { it.seq } ?: -1
        if (updatedRun.state == RunState.FINISHED && uploadedThrough >= maxSeq) {
            if (!updatedRun.finishSent) {
                apiClient.finishRun(serverRunId)
                store.updateFinishSent(localId, true)
            }
            
            // d. Get server status with exponential backoff polling
            pollServerStatus(localId, serverRunId)
        }
    }

    private suspend fun pollServerStatus(localId: Long, serverRunId: String) {
        var backoffMs = 2000L
        val maxBackoffMs = 30000L
        val maxDurationMs = 5 * 60 * 1000L
        val startTime = System.currentTimeMillis()
        
        while (System.currentTimeMillis() - startTime < maxDurationMs) {
            val summary = apiClient.getRunSummary(serverRunId)
            if (summary != null) {
                store.updateServerStatus(localId, summary.status)
                if (summary.status == "finalized" || summary.status == "flagged" || summary.status == "rejected") {
                    break
                }
            }
            kotlinx.coroutines.delay(backoffMs)
            backoffMs = (backoffMs * 2).coerceAtMost(maxBackoffMs)
        }
    }
}
package com.runapp.data

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class RunState {
    RECORDING, FINISHED
}

@Entity(tableName = "runs")
data class RunEntity(
    @PrimaryKey(autoGenerate = true) val localId: Long = 0,
    val serverRunId: String? = null,
    val state: RunState,
    val startedAt: Long,
    val finishedAt: Long? = null,
    val rejectionCounts: String, // JSON map of RejectionReason to count
    val uploadedThroughSeq: Int? = null,
    val finishSent: Boolean = false,
    val serverStatus: String? = null
)
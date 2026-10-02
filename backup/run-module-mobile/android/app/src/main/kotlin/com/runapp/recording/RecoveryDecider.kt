package com.runapp.recording

import com.runapp.data.RunEntity
import com.runapp.data.RunState

sealed class RecoveryAction {
    object NoAction : RecoveryAction()
    data class OfferRecovery(val runLocalId: Long) : RecoveryAction()
    data class FinishExtras(val activeRunLocalId: Long, val extrasToFinish: List<Long>) : RecoveryAction()
}

object RecoveryDecider {
    fun decide(runs: List<RunEntity>): RecoveryAction {
        val recordingRuns = runs.filter { it.state == RunState.RECORDING }
            .sortedByDescending { it.startedAt }
        
        return when (recordingRuns.size) {
            0 -> RecoveryAction.NoAction
            1 -> RecoveryAction.OfferRecovery(recordingRuns.first().localId)
            else -> {
                val newest = recordingRuns.first()
                val extras = recordingRuns.drop(1).map { it.localId }
                RecoveryAction.FinishExtras(activeRunLocalId = newest.localId, extrasToFinish = extras)
            }
        }
    }
}
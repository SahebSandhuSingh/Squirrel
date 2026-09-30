package com.runapp.sync

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CreateRunRequest(
    @SerialName("started_at") val startedAt: String
)

@Serializable
data class CreateRunResponse(
    @SerialName("run_id") val runId: String
)

@Serializable
data class UploadPoint(
    val seq: Int,
    val lat: Double,
    val lng: Double,
    @SerialName("accuracy_m") val accuracyM: Float,
    @SerialName("recorded_at") val recordedAt: String,
    @SerialName("is_mock") val isMock: Boolean
)

@Serializable
data class UploadPointsRequest(
    @SerialName("idempotency_key") val idempotencyKey: String,
    val points: List<UploadPoint>
)

@Serializable
data class UploadPointsResponse(
    val accepted: Int,
    @SerialName("duplicates_ignored") val duplicatesIgnored: Int
)

@Serializable
data class FinishRunResponse(
    @SerialName("run_id") val runId: String,
    val status: String
)

@Serializable
data class RunSummaryResponse(
    @SerialName("run_id") val runId: String,
    val status: String,
    @SerialName("started_at") val startedAt: String,
    val stats: RunStats,
    val territory: Territory? = null,
    val rejection: Rejection? = null,
    val score: Score? = null
)

@Serializable
data class RunStats(
    @SerialName("distance_m") val distanceM: Double? = null,
    @SerialName("moving_time_s") val movingTimeS: Int? = null,
    @SerialName("elapsed_time_s") val elapsedTimeS: Int? = null
)

@Serializable
data class Territory(
    val id: String,
    @SerialName("area_m2") val areaM2: Double,
    @SerialName("claimed_at") val claimedAt: String
)

@Serializable
data class Rejection(
    val reason: String,
    val detail: String? = null,
    @SerialName("rejected_at") val rejectedAt: String
)

@Serializable
data class Score(
    val aggregate: Double,
    val band: String,
    @SerialName("decisive_layer") val decisiveLayer: String? = null
)
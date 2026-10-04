package com.runapp.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "points",
    primaryKeys = ["runLocalId", "seq"],
    foreignKeys = [
        ForeignKey(
            entity = RunEntity::class,
            parentColumns = ["localId"],
            childColumns = ["runLocalId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["runLocalId"])]
)
data class PointEntity(
    val runLocalId: Long,
    val seq: Int,
    val lat: Double,
    val lng: Double,
    val accuracyM: Float,
    val recordedAt: Long
)
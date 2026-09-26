package com.runapp.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface RunDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertRun(run: RunEntity): Long

    @Update
    suspend fun updateRun(run: RunEntity)

    @Query("UPDATE runs SET uploadedThroughSeq = :seq WHERE localId = :id")
    suspend fun updateUploadedThroughSeq(id: Long, seq: Int)

    @Query("UPDATE runs SET finishSent = :sent WHERE localId = :id")
    suspend fun updateFinishSent(id: Long, sent: Boolean)

    @Query("UPDATE runs SET serverStatus = :status WHERE localId = :id")
    suspend fun updateServerStatus(id: Long, status: String)

    @Query("UPDATE runs SET rejectionCounts = :counts WHERE localId = :id")
    suspend fun updateRejectionCounts(id: Long, counts: String)

    @Query("UPDATE runs SET state = :state, finishedAt = :finishedAt WHERE localId = :id")
    suspend fun updateState(id: Long, state: RunState, finishedAt: Long)

    @Query("SELECT * FROM runs WHERE state = :state")
    suspend fun getRunsByState(state: RunState): List<RunEntity>

    @Query("SELECT * FROM runs WHERE localId = :id")
    suspend fun getRun(id: Long): RunEntity?

    @Query("SELECT * FROM runs WHERE localId = :id")
    fun getRunFlow(id: Long): Flow<RunEntity?>

    @Query("SELECT * FROM runs ORDER BY localId DESC")
    suspend fun getAllRuns(): List<RunEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertPoint(point: PointEntity)

    @Query("SELECT * FROM points WHERE runLocalId = :runLocalId ORDER BY seq ASC")
    suspend fun getPointsForRun(runLocalId: Long): List<PointEntity>

    @Query("SELECT * FROM points WHERE runLocalId = :runLocalId ORDER BY seq ASC")
    fun getPointsForRunFlow(runLocalId: Long): Flow<List<PointEntity>>

    @Query("SELECT COUNT(*) FROM points WHERE runLocalId = :runLocalId")
    fun getPointCountFlow(runLocalId: Long): Flow<Int>
    
    @Query("SELECT COUNT(*) FROM points WHERE runLocalId = :runLocalId")
    suspend fun getPointCount(runLocalId: Long): Int

    @Query("SELECT MAX(seq) FROM points WHERE runLocalId = :runLocalId")
    suspend fun getMaxSeqForRun(runLocalId: Long): Int?
}
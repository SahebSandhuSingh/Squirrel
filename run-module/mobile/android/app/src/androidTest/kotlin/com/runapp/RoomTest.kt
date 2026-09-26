package com.runapp

import android.database.sqlite.SQLiteConstraintException
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.runapp.data.PointEntity
import com.runapp.data.RunDatabase
import com.runapp.data.RunEntity
import com.runapp.data.RunState
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoomTest {

    private lateinit var db: RunDatabase

    @Before
    fun setup() {
        // We use an in-memory db for the duplication test, but for the 'close and reopen'
        // test we need a real file.
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        db = Room.databaseBuilder(context, RunDatabase::class.java, "test_db").build()
    }

    @After
    fun teardown() {
        db.clearAllTables()
        db.close()
    }

    @Test
    fun testA3_insert500PointsCloseAndReopen() = runBlocking {
        val runId = db.runDao().insertRun(RunEntity(state = RunState.RECORDING, startedAt = 1000L, rejectionCounts = "{}"))
        
        for (i in 0 until 500) {
            db.runDao().insertPoint(PointEntity(runId, i, 10.0, 20.0, 1f, 2000L + i))
        }
        
        db.close()

        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val reopenedDb = Room.databaseBuilder(context, RunDatabase::class.java, "test_db").build()
        
        val points = reopenedDb.runDao().getPointsForRun(runId)
        assertEquals(500, points.size)
        
        for (i in 0 until 500) {
            assertEquals(i, points[i].seq)
        }
        
        reopenedDb.close()
    }

    @Test(expected = SQLiteConstraintException::class)
    fun testA4_duplicateSeqRejected() = runBlocking {
        val runId = db.runDao().insertRun(RunEntity(state = RunState.RECORDING, startedAt = 1000L, rejectionCounts = "{}"))
        db.runDao().insertPoint(PointEntity(runId, 0, 10.0, 20.0, 1f, 2000L))
        db.runDao().insertPoint(PointEntity(runId, 0, 15.0, 25.0, 2f, 3000L))
    }

    @Test
    fun testA5_resumeSeqContinues() = runBlocking {
        val runId = db.runDao().insertRun(RunEntity(state = RunState.RECORDING, startedAt = 1000L, rejectionCounts = "{}"))
        for (i in 0 until 10) {
            db.runDao().insertPoint(PointEntity(runId, i, 10.0, 20.0, 1f, 2000L + i))
        }
        
        val maxSeq = db.runDao().getMaxSeqForRun(runId)
        assertNotNull(maxSeq)
        assertEquals(9, maxSeq)
        
        // Resume adds next
        db.runDao().insertPoint(PointEntity(runId, maxSeq!! + 1, 10.0, 20.0, 1f, 3000L))
        
        val points = db.runDao().getPointsForRun(runId)
        assertEquals(11, points.size)
        for (i in 0 until 11) {
            assertEquals(i, points[i].seq)
        }
    }
}
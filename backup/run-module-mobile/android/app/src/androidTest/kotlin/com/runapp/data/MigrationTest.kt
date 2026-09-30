package com.runapp.data

import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MigrationTest {
    private val TEST_DB = "migration-test"

    @Rule
    @JvmField
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        RunDatabase::class.java,
        emptyList(),
        FrameworkSQLiteOpenHelperFactory()
    )

    @Test
    fun migrate1To2() {
        var db = helper.createDatabase(TEST_DB, 1)

        db.execSQL("INSERT INTO runs (localId, serverRunId, state, startedAt, finishedAt, rejectionCounts) VALUES (1, null, 'RECORDING', 1000, null, '{}')")
        
        for (i in 0 until 500) {
            db.execSQL("INSERT INTO points (runLocalId, seq, lat, lng, accuracyM, recordedAt) VALUES (1, $i, 40.0, -73.0, 4.0, 1000)")
        }
        
        db.close()

        db = helper.runMigrationsAndValidate(TEST_DB, 2, true, MIGRATION_1_2)
        
        val cursor = db.query("SELECT COUNT(*) FROM points WHERE runLocalId = 1")
        cursor.moveToFirst()
        assertEquals(500, cursor.getInt(0))
        cursor.close()
    }
}
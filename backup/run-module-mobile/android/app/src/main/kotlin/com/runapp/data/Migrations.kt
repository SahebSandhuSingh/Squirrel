package com.runapp.data

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE runs ADD COLUMN uploadedThroughSeq INTEGER")
        db.execSQL("ALTER TABLE runs ADD COLUMN finishSent INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE runs ADD COLUMN serverStatus TEXT")
    }
}
package com.runapp.core

import org.junit.Assert.assertEquals
import org.junit.Test

class TypesTest {
    @Test
    fun testGpsPointEquality() {
        val p1 = GpsPoint(10.0, 20.0, 5f, 1000L, false)
        val p2 = GpsPoint(10.0, 20.0, 5f, 1000L, false)
        assertEquals(p1, p2)
    }
}

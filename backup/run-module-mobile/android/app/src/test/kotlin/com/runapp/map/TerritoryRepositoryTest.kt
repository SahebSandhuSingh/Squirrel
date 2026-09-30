package com.runapp.map

import com.runapp.sync.ApiClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before

class TerritoryRepositoryTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: TerritoryRepository

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()
        val apiClient = ApiClient(server.url("/").toString().removeSuffix("/"), "token", OkHttpClient())
        repository = TerritoryRepository(apiClient)
    }

    @After
    fun teardown() {
        server.shutdown()
    }

    @Test
    fun testM1_ParseAndComputeBoundingBox() {
        val syntheticResponse = """{ "territories": [ { "id": "t1", "area_m2": 100.0, "claimed_at": "2023-01-01T00:00:00Z", "state": "active", "geometry": { "type": "Polygon", "coordinates": [[[0.0, 0.0], [0.0, 10.0], [10.0, 10.0], [10.0, 0.0], [0.0, 0.0]]] } } ], "truncated": false }"""
        server.enqueue(MockResponse().setResponseCode(200).setBody(syntheticResponse))
        
        val response = repository.fetchMyTerritories()
        assertEquals(1, response.territories.size)
        
        val bbox = repository.computeBoundingBox(response.territories)
        assertEquals(0.0, bbox?.minLng ?: -1.0, 0.001)
        assertEquals(0.0, bbox?.minLat ?: -1.0, 0.001)
        assertEquals(10.0, bbox?.maxLng ?: -1.0, 0.001)
        assertEquals(10.0, bbox?.maxLat ?: -1.0, 0.001)
    }

    @Test
    fun testM2_EmptyEntriesYieldsEmptyState() {
        val syntheticResponse = """{ "territories": [], "truncated": false }"""
        server.enqueue(MockResponse().setResponseCode(200).setBody(syntheticResponse))
        
        val response = repository.fetchMyTerritories()
        assertEquals(0, response.territories.size)
        
        val bbox = repository.computeBoundingBox(response.territories)
        assertNull(bbox)
    }
}

class JwtUtilTest {
    @Test
    fun testM3_DecodeJwtSub() {
        val token = "header.eyJzdWIiOiAidXNlcjEyMyJ9.signature"
        val sub = JwtUtil.decodeSub(token)
        assertEquals("user123", sub)
        
        val malformed = "header.invalid.signature"
        val malformedSub = JwtUtil.decodeSub(malformed)
        assertNull(malformedSub)
    }
}
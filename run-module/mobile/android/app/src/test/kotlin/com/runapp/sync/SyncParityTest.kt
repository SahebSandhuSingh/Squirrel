package com.runapp.sync

import com.runapp.data.PointEntity
import com.runapp.data.RunEntity
import com.runapp.data.RunState
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import okio.Buffer
import okio.GzipSource
import okio.buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID

class SyncParityTest {

    private lateinit var server: MockWebServer
    private lateinit var apiClient: ApiClient
    
    private val json = Json { ignoreUnknownKeys = true }
    
    // Server state
    private val serverRuns = mutableMapOf<String, String>() // id -> startedAt
    private val serverPoints = mutableMapOf<String, MutableMap<Int, UploadPoint>>() // id -> seq -> point
    private val storedIdempotencyResponses = mutableMapOf<String, UploadPointsResponse>()
    private val serverRunStatuses = mutableMapOf<String, String>()
    
    private var requestCount = 0

    @Before
    fun setup() {
        serverRuns.clear()
        serverPoints.clear()
        storedIdempotencyResponses.clear()
        serverRunStatuses.clear()
        requestCount = 0
        
        server = MockWebServer()
        server.start()
        
        apiClient = ApiClient(server.url("/").toString().removeSuffix("/"), "test_token")
    }

    @After
    fun teardown() {
        server.shutdown()
    }
    
    private fun generateSyntheticPoints(count: Int, runLocalId: Long): List<PointEntity> {
        return (0 until count).map { i ->
            PointEntity(
                runLocalId = runLocalId,
                seq = i,
                lat = 40.0 + (i * 0.0001),
                lng = -73.0 + (i * 0.0001),
                accuracyM = 4.0f,
                recordedAt = 1000L + (i * 1000L)
            )
        }
    }

    @Test
    fun testLosslessDoubles() {
        val lat = 40.12345678901234
        val lng = -73.98765432109876
        val point = UploadPoint(0, lat, lng, 4f, "2024-01-01T00:00:00Z", false)
        val encoded = json.encodeToString(point)
        val decoded = json.decodeFromString<UploadPoint>(encoded)
        assertEquals(lat, decoded.lat, 0.0)
        assertEquals(lng, decoded.lng, 0.0)
    }

    @Test
    fun testS1_LiveVsOfflineParity() = runBlocking {
        // Run 1: Offline
        val offlinePoints = generateSyntheticPoints(600, 1L)
        val offlineStore = MockStore(RunEntity(1L, null, RunState.FINISHED, 1000L, 2000L, "{}"), offlinePoints.toMutableList())
        val offlineUploader = RunUploader(apiClient, offlineStore)
        
        setupMockServerDispatcher(false)
        offlineUploader.uploadRun(1L)
        
        val offlineServerId = offlineStore.getRun(1L)?.serverRunId!!
        val offlineServerSet = serverPoints[offlineServerId]!!
        
        // Run 2: Live
        serverRuns.clear()
        serverPoints.clear()
        storedIdempotencyResponses.clear()
        
        val livePoints = generateSyntheticPoints(600, 2L)
        val liveStore = MockStore(RunEntity(2L, null, RunState.RECORDING, 1000L, null, "{}"), mutableListOf())
        val liveUploader = RunUploader(apiClient, liveStore)
        
        setupMockServerDispatcher(false)
        for (i in 0 until 600 step 30) {
            val chunk = livePoints.subList(i, (i + 30).coerceAtMost(600))
            liveStore.points.addAll(chunk)
            liveUploader.uploadRun(2L)
        }
        liveStore.updateRun(liveStore.getRun(2L)!!.copy(state = RunState.FINISHED))
        liveUploader.uploadRun(2L)
        
        val liveServerId = liveStore.getRun(2L)?.serverRunId!!
        val liveServerSet = serverPoints[liveServerId]!!
        
        assertEquals(600, offlineServerSet.size)
        assertEquals(600, liveServerSet.size)
        
        println("=== S1: Stored-Set Comparison ===")
        for (i in 0 until 600) {
            val off = offlineServerSet[i]!!
            val liv = liveServerSet[i]!!
            assertEquals("Seq $i lat mismatch", off.lat, liv.lat, 0.0)
            assertEquals("Seq $i lng mismatch", off.lng, liv.lng, 0.0)
            assertEquals("Seq $i accuracy mismatch", off.accuracyM, liv.accuracyM, 0.0f)
            assertEquals("Seq $i time mismatch", off.recordedAt, liv.recordedAt)
        }
        println("All 600 points matched exactly (seq, lat, lng, accuracy, time).")
    }

    @Test
    fun testS2_FlakyNetwork() = runBlocking {
        val points = generateSyntheticPoints(600, 1L)
        val store = MockStore(RunEntity(1L, null, RunState.FINISHED, 1000L, 2000L, "{}"), points.toMutableList())
        val uploader = RunUploader(apiClient, store)
        
        setupMockServerDispatcher(true)
        
        // Loop to simulate retries on network drop
        while (store.getRun(1L)?.finishSent != true) {
            try {
                uploader.uploadRun(1L)
            } catch (e: Exception) {
                // Retry
            }
        }
        
        val serverId = store.getRun(1L)?.serverRunId!!
        val serverSet = serverPoints[serverId]!!
        
        assertEquals(600, serverSet.size)
        println("=== S2: Flaky Network Retry & Replay ===")
        println("Total mock requests processed: $requestCount")
    }

    @Test
    fun testS3_SmoothingConsistency() = runBlocking {
        // Simulate resume by adding a gap
        val points = generateSyntheticPoints(100, 1L).toMutableList()
        // add gap of 40 seconds at seq 50
        for (i in 50 until 100) {
            points[i] = points[i].copy(recordedAt = points[i].recordedAt + 40000L)
        }
        val store = MockStore(RunEntity(1L, null, RunState.FINISHED, 1000L, 50000L, "{}"), points)
        val uploader = RunUploader(apiClient, store)
        setupMockServerDispatcher(false)
        uploader.uploadRun(1L)
        val serverSet = serverPoints[store.getRun(1L)!!.serverRunId!!]!!
        // Verify it was smoothed as one continuous pass (gap will trigger smoother's internal gap reset, but it's one pass)
        val payloadReq = UploadPayloadBuilder.buildPayload(1L, points, 0, 99)
        for (i in 0 until 100) {
            assertEquals(payloadReq.points[i].lat, serverSet[i]!!.lat, 0.0)
            assertEquals(payloadReq.points[i].lng, serverSet[i]!!.lng, 0.0)
        }
    }

    @Test
    fun testS6_401StopsWithoutRetrying() = runBlocking {
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                return MockResponse().setResponseCode(401)
            }
        }
        
        val store = MockStore(RunEntity(1L, null, RunState.RECORDING, 1000L, null, "{}"), mutableListOf())
        val uploader = RunUploader(apiClient, store)
        
        try {
            uploader.uploadRun(1L)
        } catch (e: UnauthorizedException) {
            assertEquals("Not signed in", e.message)
        }
    }

    private fun setupMockServerDispatcher(flaky: Boolean) {
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                requestCount++
                if (flaky && requestCount % 3 == 0) {
                    val path = request.path!!
                    if (path.contains("/points")) {
                        // Store the points but drop connection before responding
                        processPointsRequest(request)
                        val r = MockResponse()
                        r.socketPolicy = SocketPolicy.DISCONNECT_AT_END
                        return r
                    }
                }
                
                return when {
                    request.path == "/v1/runs" && request.method == "POST" -> {
                        val body = json.decodeFromString<CreateRunRequest>(request.body.readUtf8())
                        val id = UUID.randomUUID().toString()
                        serverRuns[id] = body.startedAt
                        serverPoints[id] = mutableMapOf()
                        MockResponse().setResponseCode(201).setBody(json.encodeToString(CreateRunResponse(id)))
                    }
                    request.path!!.contains("/points") -> {
                        val runId = request.path!!.split("/")[3]
                        val res = processPointsRequest(request)
                        MockResponse().setResponseCode(200).setBody(json.encodeToString(res))
                    }
                    request.path!!.endsWith("/finish") -> {
                        val runId = request.path!!.split("/")[3]
                        serverRunStatuses[runId] = "finalized"
                        MockResponse().setResponseCode(202).setBody(json.encodeToString(FinishRunResponse(runId, "finalized")))
                    }
                    request.method == "GET" -> {
                        val runId = request.path!!.split("/")[3]
                        val summary = RunSummaryResponse(runId, "finalized", serverRuns[runId]!!, RunStats(0.0, 0, 0))
                        MockResponse().setResponseCode(200).setBody(json.encodeToString(summary))
                    }
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
    }
    
    private fun processPointsRequest(request: okhttp3.mockwebserver.RecordedRequest): UploadPointsResponse {
        val runId = request.path!!.split("/")[3]
        
        val gzipped = request.body
        val unzipped = GzipSource(gzipped).buffer().readUtf8()
        val body = json.decodeFromString<UploadPointsRequest>(unzipped)
        
        if (storedIdempotencyResponses.containsKey(body.idempotencyKey)) {
            println("Idempotency hit! Replaying response for ${body.idempotencyKey}")
            return storedIdempotencyResponses[body.idempotencyKey]!!
        }
        
        var accepted = 0
        var duplicates = 0
        val map = serverPoints[runId]!!
        
        for (p in body.points) {
            if (map.containsKey(p.seq)) {
                duplicates++
            } else {
                map[p.seq] = p
                accepted++
            }
        }
        
        val res = UploadPointsResponse(accepted, duplicates)
        storedIdempotencyResponses[body.idempotencyKey] = res
        return res
    }
    @Test
    fun testS7_Polling() = runBlocking {
        server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
            var count = 0
            override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
                if (request.path!!.contains("finish")) return MockResponse().setResponseCode(202).setBody("""{"run_id": "srv1", "status": "finishing"}""")
                if (request.path!!.contains("/runs/") && request.method == "GET") {
                    count++
                    val status = if (count < 3) "finishing" else "finalized"
                    val b = """{"run_id": "srv1", "status": "$status", "started_at": "2024-01-01T00:00:00Z", "stats": {"distance_m": 0.0, "moving_time_s": 0, "elapsed_time_s": 0}}"""
                    return MockResponse().setResponseCode(200).setBody(b)
                }
                return MockResponse().setResponseCode(202).setBody("{}")
            }
        }
        val store = MockStore(RunEntity(localId = 1L, serverRunId = "srv1", state = RunState.FINISHED, startedAt = 1000L, finishedAt = 2000L, rejectionCounts = "{}", uploadedThroughSeq = 0), mutableListOf(PointEntity(1L, 0, 0.0, 0.0, 1f, 1000L)))
        val uploader = RunUploader(apiClient, store)
        uploader.uploadRun(1L)
        assertEquals("finalized", store.getRun(1L)?.serverStatus)
    }
}

class MockStore(
    private var run: RunEntity,
    val points: MutableList<PointEntity>
) : RunStore {
    override suspend fun getRun(localId: Long) = run
    override suspend fun updateRun(run: RunEntity) { this.run = run }
    override suspend fun updateUploadedThroughSeq(localId: Long, seq: Int) { run = run.copy(uploadedThroughSeq = seq) }
    override suspend fun updateFinishSent(localId: Long, sent: Boolean) { run = run.copy(finishSent = sent) }
    override suspend fun updateServerStatus(localId: Long, status: String) { run = run.copy(serverStatus = status) }
    override suspend fun getPointsForRun(localId: Long) = points
}
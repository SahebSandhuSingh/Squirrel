package com.runapp.sync

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.Buffer
import okio.GzipSink
import okio.buffer
import java.io.IOException

class ApiClient(
    private val baseUrl: String,
    private val token: String,
    private val client: OkHttpClient = OkHttpClient()
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    fun createRun(request: CreateRunRequest): CreateRunResponse? {
        val body = json.encodeToString(request).toRequestBody(jsonMediaType)
        val req = Request.Builder()
            .url("$baseUrl/v1/runs")
            .post(body)
            .addHeader("Authorization", "Bearer $token")
            .build()
        
        client.newCall(req).execute().use { response ->
            handleAuthOrThrow(response)
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            return json.decodeFromString(response.body?.string() ?: "{}")
        }
    }

    fun uploadPoints(runId: String, request: UploadPointsRequest): UploadPointsResponse? {
        val jsonString = json.encodeToString(request)
        
        val buffer = Buffer()
        GzipSink(buffer).buffer().use { sink ->
            sink.writeUtf8(jsonString)
        }
        val gzippedBody = buffer.readByteString().toByteArray().toRequestBody(jsonMediaType)
        
        val req = Request.Builder()
            .url("$baseUrl/v1/runs/$runId/points")
            .post(gzippedBody)
            .addHeader("Content-Encoding", "gzip")
            .addHeader("Authorization", "Bearer $token")
            .build()
            
        client.newCall(req).execute().use { response ->
            handleAuthOrThrow(response)
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            return json.decodeFromString(response.body?.string() ?: "{}")
        }
    }

    fun finishRun(runId: String): FinishRunResponse? {
        val req = Request.Builder()
            .url("$baseUrl/v1/runs/$runId/finish")
            .post(ByteArray(0).toRequestBody(null))
            .addHeader("Authorization", "Bearer $token")
            .build()
            
        client.newCall(req).execute().use { response ->
            handleAuthOrThrow(response)
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            return json.decodeFromString(response.body?.string() ?: "{}")
        }
    }

    fun getRunSummary(runId: String): RunSummaryResponse? {
        val req = Request.Builder()
            .url("$baseUrl/v1/runs/$runId")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()
            
        client.newCall(req).execute().use { response ->
            handleAuthOrThrow(response)
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            return json.decodeFromString(response.body?.string() ?: "{}")
        }
    }

        fun getTerritoriesMine(): String? {
        val req = Request.Builder()
            .url("$baseUrl/v1/territories/mine")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()
            
        client.newCall(req).execute().use { response ->
            handleAuthOrThrow(response)
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
            return response.body?.string()
        }
    }

    private fun handleAuthOrThrow(response: Response) {
        if (response.code == 401) {
            throw UnauthorizedException()
        }
        if (response.code == 403 || response.code == 404) {
            throw ClientErrorException("HTTP ${response.code}")
        }
    }

    companion object {
        const val TERRITORY_TILE_URL_TEMPLATE = "http://10.0.2.2:3000/v1/territories/tiles/{z}/{x}/{y}.mvt"
    }
}

class UnauthorizedException : IOException("Not signed in")
class ClientErrorException(msg: String) : IOException(msg)
package app.squirrelsocial.nearby

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.time.Instant
import java.time.OffsetDateTime

/**
 * Blocking client for the nearby endpoints. Call from a background thread.
 *
 * [accessToken] is supplied by the app's existing auth layer (POST /api/auth/login | refresh);
 * this client never sees credentials.
 */
class NearbyApi(
    private val baseUrl: String,
    private val accessToken: () -> String?,
) {
    /** 409: device session unknown/expired (e.g. server restart) — open a new one. */
    class SessionGoneException : IOException("device session expired")

    /** 403: the user turned Nearby Discovery off (possibly on another device). */
    class DiscoveryOffException : IOException("nearby discovery is off")

    /** 401: the access token must be refreshed by the app. */
    class UnauthorizedException : IOException("access token rejected")

    data class BleIdWindow(val bleId: String, val validFromMs: Long, val validUntilMs: Long)

    data class DeviceSession(val id: String, val ids: List<BleIdWindow>) {
        fun idAt(nowMs: Long): String? = ids.firstOrNull { nowMs >= it.validFromMs && nowMs < it.validUntilMs }?.bleId
        fun remainingWindows(nowMs: Long): Int = ids.count { it.validUntilMs > nowMs }
    }

    data class NearbyNotification(val id: String, val title: String, val body: String, val deepLink: String)

    fun openSession(existingSessionId: String?): DeviceSession {
        val body = JSONObject().put("platform", "android")
        if (existingSessionId != null) body.put("device_session", existingSessionId)
        val json = request("POST", "/api/proximity/session", body)
        val ids = json.getJSONArray("ble_ids")
        return DeviceSession(
            id = json.getString("device_session"),
            ids = (0 until ids.length()).map { i ->
                val e = ids.getJSONObject(i)
                BleIdWindow(e.getString("ble_id"), parseTime(e.getString("valid_from")), parseTime(e.getString("valid_until")))
            },
        )
    }

    fun uploadDetections(sessionId: String, batch: List<Sighting>) {
        if (batch.isEmpty()) return
        val detections = JSONArray()
        for (s in batch) {
            detections.put(
                JSONObject()
                    .put("anonymous_device_token", s.bleId)
                    .put("timestamp", Instant.ofEpochMilli(s.timestampMs).toString())
                    .put("approximate_signal_strength", s.rssi),
            )
        }
        request("POST", "/api/proximity/detection", JSONObject().put("device_session", sessionId).put("detections", detections))
    }

    fun collectNotifications(): List<NearbyNotification> {
        val list = request("POST", "/api/notifications/nearby", null).getJSONArray("notifications")
        return (0 until list.length()).map { i ->
            val n = list.getJSONObject(i)
            NearbyNotification(n.getString("id"), n.getString("title"), n.getString("body"), n.getString("deep_link"))
        }
    }

    private fun request(method: String, path: String, body: JSONObject?): JSONObject {
        val conn = URI(baseUrl.trimEnd('/') + path).toURL().openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("Accept", "application/json")
            accessToken()?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            when (val code = conn.responseCode) {
                in 200..299 -> return JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                401 -> throw UnauthorizedException()
                403 -> throw DiscoveryOffException()
                409 -> throw SessionGoneException()
                else -> throw IOException("HTTP $code for $path")
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun parseTime(iso: String): Long = OffsetDateTime.parse(iso).toInstant().toEpochMilli()
}

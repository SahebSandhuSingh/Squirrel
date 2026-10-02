package app.squirrelsocial.nearby

import java.util.UUID

/**
 * Wire constants shared with the backend (backend/nearby/protocol.py) and the iOS client.
 *
 * The advertisement carries ONLY [SERVICE_UUID]. The rotating anonymous id is read over GATT from
 * [BLE_ID_CHARACTERISTIC_UUID] as `[PAYLOAD_VERSION][16-byte id]` — iOS cannot put service or
 * manufacturer data in an advertisement, so both platforms use the same GATT read.
 */
object NearbyProtocol {
    val SERVICE_UUID: UUID = UUID.fromString("3c0b02ed-d244-4234-a411-8cdaf5812f97")
    val BLE_ID_CHARACTERISTIC_UUID: UUID = UUID.fromString("da2ec0af-a58d-4d28-aa65-ce93dfab8cbf")
    const val PAYLOAD_VERSION: Byte = 1
    const val BLE_ID_BYTES = 16

    /** Ids rotate on fixed wall-clock windows shared by every device. */
    const val ROTATION_MS = 15 * 60_000L
    const val UPLOAD_INTERVAL_MS = 60_000L
    const val MIN_SIGHTING_SPACING_MS = 5_000L
    const val MAX_SIGHTING_AGE_MS = 15 * 60_000L
    const val PEER_CACHE_MAX_MS = 5 * 60_000L
    const val MAX_UPLOAD_BATCH = 200

    fun encodePayload(bleIdHex: String): ByteArray {
        require(bleIdHex.length == BLE_ID_BYTES * 2) { "ble id must be $BLE_ID_BYTES bytes" }
        val out = ByteArray(1 + BLE_ID_BYTES)
        out[0] = PAYLOAD_VERSION
        for (i in 0 until BLE_ID_BYTES) {
            out[i + 1] = bleIdHex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
        return out
    }

    /** Returns the lowercase hex id, or null for anything that is not a valid Squirrel payload. */
    fun decodePayload(value: ByteArray?): String? {
        if (value == null || value.size != 1 + BLE_ID_BYTES || value[0] != PAYLOAD_VERSION) return null
        val sb = StringBuilder(BLE_ID_BYTES * 2)
        for (i in 1..BLE_ID_BYTES) sb.append(String.format("%02x", value[i].toInt() and 0xff))
        return sb.toString()
    }

    /** Start of the rotation window after [nowMs]; cached peer ids are invalid past this point. */
    fun nextRotationBoundary(nowMs: Long): Long = (nowMs / ROTATION_MS + 1) * ROTATION_MS
}

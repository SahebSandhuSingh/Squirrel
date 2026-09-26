package app.squirrelsocial.nearby

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NearbyProtocolTest {
    private val id = "00112233445566778899aabbccddeeff"

    @Test
    fun payloadRoundTrip() {
        val payload = NearbyProtocol.encodePayload(id)
        assertEquals(17, payload.size)
        assertEquals(NearbyProtocol.PAYLOAD_VERSION, payload[0])
        assertEquals(id, NearbyProtocol.decodePayload(payload))
    }

    @Test
    fun rejectsForeignPayloads() {
        assertNull(NearbyProtocol.decodePayload(null))
        assertNull(NearbyProtocol.decodePayload(ByteArray(16)))
        assertNull(NearbyProtocol.decodePayload(ByteArray(17).also { it[0] = 9 }))
    }

    @Test
    fun rotationBoundaryIsWallClockAligned() {
        val r = NearbyProtocol.ROTATION_MS
        assertEquals(2 * r, NearbyProtocol.nextRotationBoundary(r + 1))
        assertEquals(2 * r, NearbyProtocol.nextRotationBoundary(r))
    }
}

class DetectionBufferTest {
    private var now = 1_000_000L
    private val buffer = DetectionBuffer(clock = { now })

    @Test
    fun throttlesRepeatSightingsOfOnePeer() {
        assertTrue(buffer.record("a", -60))
        now += 1_000
        assertFalse(buffer.record("a", -61))
        assertTrue(buffer.record("b", -70))
        now += NearbyProtocol.MIN_SIGHTING_SPACING_MS
        assertTrue(buffer.record("a", -62))
        assertEquals(listOf("a", "b", "a"), buffer.drain().map { it.bleId })
        assertEquals(0, buffer.size())
    }

    @Test
    fun dropsSightingsTooOldToMatter() {
        buffer.record("a", -60)
        now += NearbyProtocol.MAX_SIGHTING_AGE_MS + 1
        buffer.record("b", -60)
        assertEquals(listOf("b"), buffer.drain().map { it.bleId })
    }

    @Test
    fun requeueKeepsOrderAfterFailedUpload() {
        buffer.record("a", -60)
        buffer.record("b", -60)
        val batch = buffer.drain(max = 1)
        buffer.record("c", -60)
        buffer.requeue(batch)
        assertEquals(listOf("a", "b", "c"), buffer.drain().map { it.bleId })
    }
}

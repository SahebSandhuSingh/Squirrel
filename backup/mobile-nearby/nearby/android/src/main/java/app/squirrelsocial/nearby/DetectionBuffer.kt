package app.squirrelsocial.nearby

/** One sighting of another Squirrel phone. */
data class Sighting(val bleId: String, val timestampMs: Long, val rssi: Int)

/**
 * Buffers sightings until they can be uploaded (the phone may be offline).
 *
 * Scanners report the same peer many times a second; only one sighting per peer every
 * [NearbyProtocol.MIN_SIGHTING_SPACING_MS] is kept. Sightings older than
 * [NearbyProtocol.MAX_SIGHTING_AGE_MS] are discarded — the server would ignore them anyway, and the
 * phone should not accumulate a proximity history either.
 */
class DetectionBuffer(
    private val clock: () -> Long = System::currentTimeMillis,
    private val maxSize: Int = 1_000,
) {
    private val pending = ArrayList<Sighting>()
    private val lastRecorded = HashMap<String, Long>()

    @Synchronized
    fun record(bleId: String, rssi: Int): Boolean {
        val now = clock()
        val last = lastRecorded[bleId]
        if (last != null && now - last < NearbyProtocol.MIN_SIGHTING_SPACING_MS) return false
        lastRecorded[bleId] = now
        pending.add(Sighting(bleId, now, rssi))
        while (pending.size > maxSize) pending.removeAt(0)
        return true
    }

    /** Removes and returns up to [max] of the oldest still-relevant sightings. */
    @Synchronized
    fun drain(max: Int = NearbyProtocol.MAX_UPLOAD_BATCH): List<Sighting> {
        prune()
        val batch = pending.take(max)
        pending.subList(0, batch.size).clear()
        return batch
    }

    /** Puts a batch back after a failed upload. */
    @Synchronized
    fun requeue(batch: List<Sighting>) {
        pending.addAll(0, batch)
        prune()
        while (pending.size > maxSize) pending.removeAt(0)
    }

    @Synchronized
    fun clear() {
        pending.clear()
        lastRecorded.clear()
    }

    @Synchronized
    fun size(): Int = pending.size

    private fun prune() {
        val cutoff = clock() - NearbyProtocol.MAX_SIGHTING_AGE_MS
        pending.removeAll { it.timestampMs < cutoff }
        lastRecorded.entries.removeAll { it.value < cutoff }
    }
}

import Foundation

/// One sighting of another Squirrel phone.
struct Sighting: Equatable {
    let bleId: String
    let timestamp: Date
    let rssi: Int
}

/// Buffers sightings until they can be uploaded (the phone may be offline). Keeps at most one
/// sighting per peer every `minSightingSpacing`, and drops anything older than `maxSightingAge` —
/// the server would ignore it, and the phone should not accumulate a proximity history either.
final class DetectionBuffer {
    private let lock = NSLock()
    private let now: () -> Date
    private let maxSize: Int
    private var pending: [Sighting] = []
    private var lastRecorded: [String: Date] = [:]

    init(now: @escaping () -> Date = Date.init, maxSize: Int = 1_000) {
        self.now = now
        self.maxSize = maxSize
    }

    @discardableResult
    func record(bleId: String, rssi: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let t = now()
        if let last = lastRecorded[bleId], t.timeIntervalSince(last) < NearbyProtocol.minSightingSpacing {
            return false
        }
        lastRecorded[bleId] = t
        pending.append(Sighting(bleId: bleId, timestamp: t, rssi: rssi))
        if pending.count > maxSize { pending.removeFirst(pending.count - maxSize) }
        return true
    }

    func drain(max: Int = NearbyProtocol.maxUploadBatch) -> [Sighting] {
        lock.lock(); defer { lock.unlock() }
        prune()
        let batch = Array(pending.prefix(max))
        pending.removeFirst(batch.count)
        return batch
    }

    func requeue(_ batch: [Sighting]) {
        lock.lock(); defer { lock.unlock() }
        pending.insert(contentsOf: batch, at: 0)
        prune()
        if pending.count > maxSize { pending.removeFirst(pending.count - maxSize) }
    }

    func clear() {
        lock.lock(); defer { lock.unlock() }
        pending.removeAll()
        lastRecorded.removeAll()
    }

    private func prune() {
        let cutoff = now().addingTimeInterval(-NearbyProtocol.maxSightingAge)
        pending.removeAll { $0.timestamp < cutoff }
        lastRecorded = lastRecorded.filter { $0.value >= cutoff }
    }
}

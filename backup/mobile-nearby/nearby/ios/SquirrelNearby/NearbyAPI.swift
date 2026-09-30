import Foundation

/// Client for the nearby endpoints. `accessToken` comes from the app's existing auth layer
/// (POST /api/auth/login | refresh); this client never sees credentials.
struct NearbyAPI {
    enum Failure: Error {
        case unauthorized      // 401 — the app must refresh the access token
        case discoveryOff      // 403 — Nearby Discovery was switched off (maybe on another device)
        case sessionGone       // 409 — device session unknown/expired; open a new one
        case http(Int)
    }

    struct BleIdWindow {
        let bleId: String
        let validFrom: Date
        let validUntil: Date
    }

    struct DeviceSession {
        let id: String
        let ids: [BleIdWindow]

        func id(at date: Date) -> String? {
            ids.first { date >= $0.validFrom && date < $0.validUntil }?.bleId
        }

        func remainingWindows(at date: Date) -> Int {
            ids.filter { $0.validUntil > date }.count
        }
    }

    struct NearbyNotification: Decodable {
        let id: String
        let title: String
        let body: String
        let deep_link: String
    }

    let baseURL: URL
    let accessToken: () async -> String?
    var session: URLSession = .shared

    func openSession(existing: String?) async throws -> DeviceSession {
        var body: [String: Any] = ["platform": "ios"]
        if let existing { body["device_session"] = existing }
        let json = try await request("POST", "/api/proximity/session", body: body)
        guard let id = json["device_session"] as? String, let raw = json["ble_ids"] as? [[String: Any]] else {
            throw Failure.http(-1)
        }
        let windows: [BleIdWindow] = raw.compactMap { e in
            guard let bleId = e["ble_id"] as? String,
                  let from = (e["valid_from"] as? String).flatMap(Self.parseDate),
                  let until = (e["valid_until"] as? String).flatMap(Self.parseDate) else { return nil }
            return BleIdWindow(bleId: bleId, validFrom: from, validUntil: until)
        }
        return DeviceSession(id: id, ids: windows)
    }

    func uploadDetections(sessionId: String, _ batch: [Sighting]) async throws {
        guard !batch.isEmpty else { return }
        let formatter = ISO8601DateFormatter()
        let detections: [[String: Any]] = batch.map {
            ["anonymous_device_token": $0.bleId,
             "timestamp": formatter.string(from: $0.timestamp),
             "approximate_signal_strength": $0.rssi]
        }
        _ = try await request("POST", "/api/proximity/detection",
                              body: ["device_session": sessionId, "detections": detections])
    }

    func collectNotifications() async throws -> [NearbyNotification] {
        let json = try await request("POST", "/api/notifications/nearby", body: nil)
        let data = try JSONSerialization.data(withJSONObject: json["notifications"] ?? [])
        return try JSONDecoder().decode([NearbyNotification].self, from: data)
    }

    private func request(_ method: String, _ path: String, body: [String: Any]?) async throws -> [String: Any] {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await accessToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        switch status {
        case 200..<300:
            return (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        case 401: throw Failure.unauthorized
        case 403: throw Failure.discoveryOff
        case 409: throw Failure.sessionGone
        default: throw Failure.http(status)
        }
    }

    /// The server emits RFC 3339 with or without fractional seconds.
    static func parseDate(_ s: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }
}

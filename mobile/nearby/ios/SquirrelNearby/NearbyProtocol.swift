import CoreBluetooth
import Foundation

/// Wire constants shared with the backend (backend/nearby/protocol.py) and the Android client.
///
/// The advertisement carries ONLY `serviceUUID` (iOS cannot advertise service or manufacturer
/// data). The rotating anonymous id is read over GATT from `bleIdCharacteristicUUID` as
/// `[payloadVersion][16-byte id]`.
enum NearbyProtocol {
    static let serviceUUID = CBUUID(string: "3C0B02ED-D244-4234-A411-8CDAF5812F97")
    static let bleIdCharacteristicUUID = CBUUID(string: "DA2EC0AF-A58D-4D28-AA65-CE93DFAB8CBF")
    static let payloadVersion: UInt8 = 1
    static let bleIdBytes = 16

    /// Ids rotate on fixed wall-clock windows shared by every device.
    static let rotationSeconds: TimeInterval = 15 * 60
    static let uploadInterval: TimeInterval = 60
    static let minSightingSpacing: TimeInterval = 5
    static let maxSightingAge: TimeInterval = 15 * 60
    static let peerCacheMax: TimeInterval = 5 * 60
    static let maxUploadBatch = 200

    static func encodePayload(_ hex: String) -> Data? {
        guard hex.count == bleIdBytes * 2 else { return nil }
        var data = Data([payloadVersion])
        var index = hex.startIndex
        for _ in 0..<bleIdBytes {
            let next = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
            data.append(byte)
            index = next
        }
        return data
    }

    /// Lowercase hex id, or nil for anything that is not a valid Squirrel payload.
    static func decodePayload(_ data: Data?) -> String? {
        guard let data, data.count == 1 + bleIdBytes, data.first == payloadVersion else { return nil }
        return data.dropFirst().map { String(format: "%02x", $0) }.joined()
    }

    /// Start of the rotation window after `date`; cached peer ids are invalid past this point.
    static func nextRotationBoundary(after date: Date) -> Date {
        let t = date.timeIntervalSince1970
        return Date(timeIntervalSince1970: (floor(t / rotationSeconds) + 1) * rotationSeconds)
    }
}

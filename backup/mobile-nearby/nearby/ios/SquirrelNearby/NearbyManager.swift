import CoreBluetooth
import Foundation
import UIKit
import UserNotifications

/// Runs Nearby Discovery while the user has it switched ON.
///
/// - Peripheral role: advertises the Squirrel service UUID and serves the current rotating id from
///   a read-only GATT characteristic.
/// - Central role: scans for the service UUID, reads each peer's id once per rotation window
///   (cached per CBPeripheral identifier), then reports RSSI for every later discovery.
/// - Sync: at most every `uploadInterval`, keeps a device session with enough pre-issued ids,
///   uploads buffered sightings and shows any nearby notification the server has queued.
///
/// iOS suspends timers in the background, so syncs are also triggered from Bluetooth wake-ups
/// (`bluetooth-central` / `bluetooth-peripheral` background modes). All CoreBluetooth work and
/// state live on `queue`.
///
/// Start only after the user enabled Nearby Discovery (PUT /api/nearby/settings).
final class NearbyManager: NSObject {
    static let shared = NearbyManager()

    /// Wire these once at launch.
    var baseURL = URL(string: "https://squirrelsocial.app")!
    var accessToken: () async -> String? = { nil }

    private let queue = DispatchQueue(label: "app.squirrelsocial.nearby")
    private let buffer = DetectionBuffer()
    private var central: CBCentralManager?
    private var peripheralManager: CBPeripheralManager?
    private let characteristic = CBMutableCharacteristic(
        type: NearbyProtocol.bleIdCharacteristicUUID, properties: [.read], value: nil, permissions: [.readable])
    private var serviceAdded = false

    private var session: NearbyAPI.DeviceSession?
    private var advertisedId: String?
    private var payload: Data?

    private var peers: [UUID: (bleId: String, validUntil: Date)] = [:]
    private var readQueue: [(peripheral: CBPeripheral, rssi: Int)] = []
    private var reading: (peripheral: CBPeripheral, rssi: Int)?

    private var timer: DispatchSourceTimer?
    private var lastSync = Date.distantPast
    private var syncing = false
    private var running = false

    private var api: NearbyAPI { NearbyAPI(baseURL: baseURL, accessToken: accessToken) }

    // MARK: lifecycle

    func start() {
        queue.async { [self] in
            guard !running else { return }
            running = true
            central = CBCentralManager(delegate: self, queue: queue, options: [
                CBCentralManagerOptionRestoreIdentifierKey: "app.squirrelsocial.nearby.central",
            ])
            peripheralManager = CBPeripheralManager(delegate: self, queue: queue, options: [
                CBPeripheralManagerOptionRestoreIdentifierKey: "app.squirrelsocial.nearby.peripheral",
            ])
            let t = DispatchSource.makeTimerSource(queue: queue)
            t.schedule(deadline: .now(), repeating: NearbyProtocol.uploadInterval)
            t.setEventHandler { [weak self] in self?.tick() }
            t.resume()
            timer = t
        }
    }

    /// Call when the user switches Nearby Discovery OFF (after PUT /api/nearby/settings).
    func stop() {
        queue.async { [self] in
            running = false
            timer?.cancel()
            timer = nil
            central?.stopScan()
            if let r = reading { central?.cancelPeripheralConnection(r.peripheral) }
            reading = nil
            readQueue.removeAll()
            peers.removeAll()
            peripheralManager?.stopAdvertising()
            peripheralManager?.removeAllServices()
            serviceAdded = false
            central = nil
            peripheralManager = nil
            session = nil
            advertisedId = nil
            payload = nil
            buffer.clear()
        }
    }

    private func tick() {
        guard running else { return }
        restartScan()          // fresh discoveries (iOS coalesces duplicates, especially in background)
        maybeSync()
    }

    // MARK: advertising

    private func updateAdvertising() {
        let id = session?.id(at: Date())
        guard id != advertisedId else { return }
        advertisedId = id
        payload = id.flatMap(NearbyProtocol.encodePayload)
        startAdvertisingIfReady(restart: true)
    }

    private func startAdvertisingIfReady(restart: Bool = false) {
        guard let pm = peripheralManager, pm.state == .poweredOn, serviceAdded, payload != nil else { return }
        if restart { pm.stopAdvertising() }
        if !pm.isAdvertising {
            pm.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [NearbyProtocol.serviceUUID]])
        }
    }

    // MARK: scanning + id reads

    private func restartScan() {
        guard let c = central, c.state == .poweredOn else { return }
        c.stopScan()
        c.scanForPeripherals(withServices: [NearbyProtocol.serviceUUID],
                             options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }

    private func record(_ bleId: String, rssi: Int) {
        guard bleId != advertisedId else { return }
        buffer.record(bleId: bleId, rssi: rssi)
    }

    private func pumpReads() {
        guard reading == nil, let c = central, c.state == .poweredOn, !readQueue.isEmpty else { return }
        let next = readQueue.removeFirst()
        reading = next
        next.peripheral.delegate = self
        c.connect(next.peripheral)
        let target = next.peripheral
        queue.asyncAfter(deadline: .now() + 8) { [weak self] in
            guard let self, self.reading?.peripheral === target else { return }
            self.finishRead()
        }
    }

    private func finishRead() {
        if let r = reading { central?.cancelPeripheralConnection(r.peripheral) }
        reading = nil
        pumpReads()
    }

    // MARK: sync

    private enum SyncOutcome {
        case ok(NearbyAPI.DeviceSession, [NearbyAPI.NearbyNotification])
        case sessionGone([Sighting])
        case off
        case failed([Sighting], NearbyAPI.DeviceSession?)
    }

    private func maybeSync() {
        guard running, !syncing, Date().timeIntervalSince(lastSync) >= NearbyProtocol.uploadInterval else { return }
        syncing = true
        lastSync = Date()
        let current = session
        let batch = buffer.drain()
        let api = self.api
        Task {
            let bg = await MainActor.run { UIApplication.shared.beginBackgroundTask(withName: "squirrel-nearby-sync") }
            var opened = current
            let outcome: SyncOutcome
            do {
                let now = Date()
                if opened == nil || opened?.id(at: now) == nil || (opened?.remainingWindows(at: now) ?? 0) < 2 {
                    opened = try await api.openSession(existing: opened?.id)
                }
                guard let s = opened else { throw NearbyAPI.Failure.sessionGone }
                try await api.uploadDetections(sessionId: s.id, batch)
                outcome = .ok(s, try await api.collectNotifications())
            } catch NearbyAPI.Failure.sessionGone {
                outcome = .sessionGone(batch)
            } catch NearbyAPI.Failure.discoveryOff {
                outcome = .off
            } catch {
                outcome = .failed(batch, opened)   // offline, or the app still has to refresh the token
            }
            queue.async { [weak self] in self?.apply(outcome) }
            await MainActor.run { UIApplication.shared.endBackgroundTask(bg) }
        }
    }

    private func apply(_ outcome: SyncOutcome) {
        syncing = false
        guard running else { return }
        switch outcome {
        case let .ok(s, notifications):
            session = s
            updateAdvertising()
            notifications.forEach(show)
        case let .sessionGone(batch):
            session = nil
            buffer.requeue(batch)
            lastSync = .distantPast
        case .off:
            stop()
        case let .failed(batch, s):
            if let s { session = s; updateAdvertising() }
            buffer.requeue(batch)
        }
    }

    private func show(_ n: NearbyAPI.NearbyNotification) {
        let content = UNMutableNotificationContent()
        content.title = n.title
        content.body = n.body
        content.userInfo = ["deep_link": n.deep_link]   // the app delegate opens this on tap
        // A fixed identifier replaces the previous nearby notification instead of stacking.
        let request = UNNotificationRequest(identifier: "squirrel.nearby", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

// MARK: - CBCentralManagerDelegate

extension NearbyManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn { restartScan() }
    }

    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        // Relaunched in the background by a Bluetooth event: scanning resumes on poweredOn.
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let rssi = RSSI.intValue
        guard running, rssi < 0 else { return }   // 127 = RSSI unavailable
        if let cached = peers[peripheral.identifier], cached.validUntil > Date() {
            record(cached.bleId, rssi: rssi)
        } else if reading?.peripheral.identifier != peripheral.identifier,
                  !readQueue.contains(where: { $0.peripheral.identifier == peripheral.identifier }) {
            peers[peripheral.identifier] = nil
            readQueue.append((peripheral, rssi))
            pumpReads()
        }
        maybeSync()
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([NearbyProtocol.serviceUUID])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        if reading?.peripheral === peripheral { finishRead() }
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if reading?.peripheral === peripheral { finishRead() }
    }
}

// MARK: - CBPeripheralDelegate (reading a peer's id)

extension NearbyManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let service = peripheral.services?.first(where: { $0.uuid == NearbyProtocol.serviceUUID }) else {
            return finishRead()
        }
        peripheral.discoverCharacteristics([NearbyProtocol.bleIdCharacteristicUUID], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let ch = service.characteristics?.first(where: { $0.uuid == NearbyProtocol.bleIdCharacteristicUUID }) else {
            return finishRead()
        }
        peripheral.readValue(for: ch)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let r = reading, r.peripheral === peripheral else { return }
        if error == nil, let bleId = NearbyProtocol.decodePayload(characteristic.value) {
            let now = Date()
            let until = min(NearbyProtocol.nextRotationBoundary(after: now), now.addingTimeInterval(NearbyProtocol.peerCacheMax))
            peers[peripheral.identifier] = (bleId, until)
            record(bleId, rssi: r.rssi)
        }
        finishRead()
    }
}

// MARK: - CBPeripheralManagerDelegate (serving our id)

extension NearbyManager: CBPeripheralManagerDelegate {
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        guard peripheral.state == .poweredOn, !serviceAdded else { return }
        let service = CBMutableService(type: NearbyProtocol.serviceUUID, primary: true)
        service.characteristics = [characteristic]
        peripheral.add(service)
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, willRestoreState dict: [String: Any]) {
        // Restored services are re-added on poweredOn; nothing to carry over.
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        serviceAdded = error == nil
        startAdvertisingIfReady()
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        guard request.characteristic.uuid == NearbyProtocol.bleIdCharacteristicUUID, let value = payload else {
            return peripheral.respond(to: request, withResult: .attributeNotFound)
        }
        guard request.offset <= value.count else {
            return peripheral.respond(to: request, withResult: .invalidOffset)
        }
        request.value = value.subdata(in: request.offset..<value.count)
        peripheral.respond(to: request, withResult: .success)
    }
}

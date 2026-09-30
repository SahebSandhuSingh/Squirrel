package app.squirrelsocial.nearby

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid

/**
 * Scans for the Squirrel service UUID and resolves each peer's rotating id with one short GATT read.
 *
 * The id for a Bluetooth address is cached until the next rotation boundary (or
 * [NearbyProtocol.PEER_CACHE_MAX_MS]), so a peer that stays nearby costs one connection per window
 * and every later advertisement just reports RSSI. Reads run one at a time on the main looper.
 * Callers must hold BLUETOOTH_SCAN + BLUETOOTH_CONNECT.
 */
@SuppressLint("MissingPermission")
class BleScanner(
    context: Context,
    private val onSighting: (bleIdHex: String, rssi: Int) -> Unit,
) {
    private data class CachedPeer(val bleId: String, val validUntilMs: Long)

    private val appContext = context.applicationContext
    private val adapter = appContext.getSystemService(BluetoothManager::class.java)?.adapter
    private val main = Handler(Looper.getMainLooper())
    private val peers = HashMap<String, CachedPeer>()
    private val queue = ArrayDeque<Pair<BluetoothDevice, Int>>()
    private var active: BluetoothGatt? = null
    private var activeRssi = 0
    private var running = false

    fun start() {
        val scanner = adapter?.bluetoothLeScanner ?: return
        running = true
        val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(NearbyProtocol.SERVICE_UUID)).build())
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()
        scanner.startScan(filters, settings, scanCallback)
    }

    fun stop() {
        running = false
        adapter?.bluetoothLeScanner?.stopScan(scanCallback)
        main.removeCallbacksAndMessages(null)
        queue.clear()
        active?.close()
        active = null
        peers.clear()
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            main.post { handle(result) }
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            main.post { results.forEach(::handle) }
        }
    }

    private fun handle(result: ScanResult) {
        if (!running) return
        val address = result.device.address
        val now = System.currentTimeMillis()
        val cached = peers[address]
        if (cached != null && now < cached.validUntilMs) {
            onSighting(cached.bleId, result.rssi)
            return
        }
        peers.remove(address)
        if (active?.device?.address != address && queue.none { it.first.address == address }) {
            queue.addLast(result.device to result.rssi)
            pump()
        }
    }

    private fun pump() {
        if (active != null || !running) return
        val (device, rssi) = queue.removeFirstOrNull() ?: return
        activeRssi = rssi
        active = device.connectGatt(appContext, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        main.postDelayed(timeout, GATT_TIMEOUT_MS)
    }

    private val timeout = Runnable { active?.let(::finish) }

    /** Idempotent: late callbacks for a connection that already timed out are ignored. */
    private fun finish(gatt: BluetoothGatt) {
        if (active !== gatt) return
        main.removeCallbacks(timeout)
        gatt.disconnect()
        gatt.close()
        active = null
        pump()
    }

    private fun onRead(gatt: BluetoothGatt, value: ByteArray?, status: Int) {
        main.post { completeRead(gatt, value, status) }
    }

    private fun completeRead(gatt: BluetoothGatt, value: ByteArray?, status: Int) {
        if (active !== gatt) return
        val bleId = if (status == BluetoothGatt.GATT_SUCCESS) NearbyProtocol.decodePayload(value) else null
        if (bleId != null) {
            val now = System.currentTimeMillis()
            val until = minOf(NearbyProtocol.nextRotationBoundary(now), now + NearbyProtocol.PEER_CACHE_MAX_MS)
            peers[gatt.device.address] = CachedPeer(bleId, until)
            onSighting(bleId, activeRssi)
        }
        finish(gatt)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
                gatt.discoverServices()
            } else {
                main.post { finish(gatt) }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val characteristic = gatt.getService(NearbyProtocol.SERVICE_UUID)
                ?.getCharacteristic(NearbyProtocol.BLE_ID_CHARACTERISTIC_UUID)
            if (status != BluetoothGatt.GATT_SUCCESS || characteristic == null || !gatt.readCharacteristic(characteristic)) {
                main.post { finish(gatt) }
            }
        }

        // API 33+
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int,
        ) {
            onRead(gatt, value, status)
        }

        // API < 33
        @Deprecated("Deprecated in API 33")
        @Suppress("DEPRECATION")
        override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) onRead(gatt, characteristic.value, status)
        }
    }

    private companion object {
        const val GATT_TIMEOUT_MS = 8_000L
    }
}

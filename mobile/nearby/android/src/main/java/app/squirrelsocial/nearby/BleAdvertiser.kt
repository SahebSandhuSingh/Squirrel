package app.squirrelsocial.nearby

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.content.Context
import android.os.ParcelUuid
import android.util.Log

/**
 * Advertises the Squirrel service UUID (nothing else) and serves the current rotating id from a
 * read-only GATT characteristic. Callers must hold BLUETOOTH_ADVERTISE + BLUETOOTH_CONNECT.
 *
 * [advertise] restarts the advertisement on every rotation so the OS picks a fresh random
 * Bluetooth address at the same moment the id changes — otherwise a stable MAC would link the old
 * and new ids.
 */
@SuppressLint("MissingPermission")
class BleAdvertiser(private val context: Context) {
    private val manager = context.getSystemService(BluetoothManager::class.java)
    private var gattServer: BluetoothGattServer? = null
    private var currentSet: AdvertisingSetCallback? = null

    @Volatile
    private var payload: ByteArray? = null

    fun advertise(bleIdHex: String) {
        payload = NearbyProtocol.encodePayload(bleIdHex)
        if (gattServer == null) openGattServer()
        val advertiser = manager?.adapter?.bluetoothLeAdvertiser ?: return
        stopAdvertising()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(ParcelUuid(NearbyProtocol.SERVICE_UUID))
            .build()
        val params = AdvertisingSetParameters.Builder()
            .setLegacyMode(true)                    // readable by older phones and iOS
            .setConnectable(true)                   // scanners connect to read the id
            .setScannable(true)
            .setInterval(AdvertisingSetParameters.INTERVAL_HIGH)          // ~1 s, battery friendly
            .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_MEDIUM)
            .build()
        val callback = object : AdvertisingSetCallback() {
            override fun onAdvertisingSetStarted(set: AdvertisingSet?, txPower: Int, status: Int) {
                if (status != ADVERTISE_SUCCESS) Log.w(TAG, "advertising failed: $status")
            }
        }
        currentSet = callback
        advertiser.startAdvertisingSet(params, data, null, null, null, callback)
    }

    fun stop() {
        stopAdvertising()
        gattServer?.close()
        gattServer = null
        payload = null
    }

    private fun stopAdvertising() {
        currentSet?.let { manager?.adapter?.bluetoothLeAdvertiser?.stopAdvertisingSet(it) }
        currentSet = null
    }

    private fun openGattServer() {
        val server = manager?.openGattServer(context, gattCallback) ?: return
        val service = BluetoothGattService(NearbyProtocol.SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        service.addCharacteristic(
            BluetoothGattCharacteristic(
                NearbyProtocol.BLE_ID_CHARACTERISTIC_UUID,
                BluetoothGattCharacteristic.PROPERTY_READ,
                BluetoothGattCharacteristic.PERMISSION_READ,
            ),
        )
        server.addService(service)
        gattServer = server
    }

    private val gattCallback = object : BluetoothGattServerCallback() {
        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic,
        ) {
            val server = gattServer ?: return
            val value = payload
            when {
                characteristic.uuid != NearbyProtocol.BLE_ID_CHARACTERISTIC_UUID || value == null ->
                    server.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
                offset > value.size ->
                    server.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
                else ->
                    server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value.copyOfRange(offset, value.size))
            }
        }
    }

    private companion object {
        const val TAG = "SquirrelAdvertiser"
        const val ADVERTISE_SUCCESS = AdvertiseCallback.ADVERTISE_SUCCESS
    }
}

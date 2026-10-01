package app.squirrelsocial.nearby

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Foreground service that runs Nearby Discovery while the user has it switched ON.
 *
 * Every [NearbyProtocol.UPLOAD_INTERVAL_MS] it: keeps a device session with enough pre-issued ids,
 * advertises the id for the current window (restarting on rotation), uploads buffered sightings,
 * and shows any nearby notification the server has queued. Sightings survive short offline
 * periods in [DetectionBuffer]; nothing is written to disk.
 *
 * Start it only after the user enabled Nearby Discovery (PUT /api/nearby/settings) and granted
 * BLUETOOTH_SCAN / BLUETOOTH_ADVERTISE / BLUETOOTH_CONNECT (+ POST_NOTIFICATIONS on 13+).
 */
class NearbyService : Service() {

    /** The host app wires these once at startup (e.g. in Application.onCreate). */
    object Config {
        @Volatile var baseUrl: String = "https://squirrelsocial.app"
        @Volatile var accessToken: () -> String? = { null }
        @Volatile var smallIcon: Int = android.R.drawable.stat_sys_data_bluetooth
    }

    private val main = Handler(Looper.getMainLooper())
    private val buffer = DetectionBuffer()
    private lateinit var worker: ScheduledExecutorService
    private lateinit var api: NearbyApi
    private lateinit var advertiser: BleAdvertiser
    private lateinit var scanner: BleScanner
    private var session: NearbyApi.DeviceSession? = null
    private var advertisedId: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannels()
        val status = Notification.Builder(this, CHANNEL_STATUS)
            .setSmallIcon(Config.smallIcon)
            .setContentTitle("Nearby Discovery is on")
            .setContentText("Squirrel Social is looking for people near you.")
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(STATUS_ID, status, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else {
            startForeground(STATUS_ID, status)
        }
        if (!hasBlePermissions()) {
            Log.w(TAG, "missing Bluetooth permissions; stopping")
            stopSelf()
            return
        }
        api = NearbyApi(Config.baseUrl, Config.accessToken)
        advertiser = BleAdvertiser(this)
        scanner = BleScanner(this) { bleId, rssi ->
            if (bleId != advertisedId) buffer.record(bleId, rssi)
        }
        scanner.start()
        worker = Executors.newSingleThreadScheduledExecutor()
        worker.scheduleWithFixedDelay(::tick, 0, NearbyProtocol.UPLOAD_INTERVAL_MS, TimeUnit.MILLISECONDS)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        if (::worker.isInitialized) worker.shutdownNow()
        if (::scanner.isInitialized) scanner.stop()
        if (::advertiser.isInitialized) advertiser.stop()
        buffer.clear()
        super.onDestroy()
    }

    /** Runs on [worker]. */
    private fun tick() {
        try {
            val now = System.currentTimeMillis()
            var current = session
            if (current == null || current.idAt(now) == null || current.remainingWindows(now) < 2) {
                current = api.openSession(current?.id)
                session = current
            }
            val id = current.idAt(now)
            if (id != null && id != advertisedId) {
                advertisedId = id
                main.post { advertiser.advertise(id) }
            }

            val batch = buffer.drain()
            try {
                api.uploadDetections(current.id, batch)
            } catch (e: IOException) {
                buffer.requeue(batch)
                throw e
            }
            api.collectNotifications().forEach(::show)
        } catch (e: NearbyApi.SessionGoneException) {
            session = null                        // re-open on the next tick; sightings were requeued
        } catch (e: NearbyApi.DiscoveryOffException) {
            main.post { stopSelf() }
        } catch (e: IOException) {
            Log.d(TAG, "nearby sync deferred: ${e.message}")   // offline or token refresh pending
        } catch (e: RuntimeException) {
            Log.w(TAG, "nearby sync failed", e)
        }
    }

    private fun show(n: NearbyApi.NearbyNotification) {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = Intent(Intent.ACTION_VIEW, Uri.parse(n.deepLink)).setPackage(packageName)
        val pending = PendingIntent.getActivity(this, n.id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, CHANNEL_NEARBY)
            .setSmallIcon(Config.smallIcon)
            .setContentTitle(n.title)
            .setContentText(n.body)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        getSystemService(NotificationManager::class.java).notify(NEARBY_ID, notification)   // replaces the last one
    }

    private fun hasBlePermissions(): Boolean {
        val needed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)   // OS requirement for BLE scans ≤ Android 11; never read
        }
        return needed.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
    }

    private fun createChannels() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_STATUS, "Nearby Discovery status", NotificationManager.IMPORTANCE_MIN))
        nm.createNotificationChannel(NotificationChannel(CHANNEL_NEARBY, "People nearby", NotificationManager.IMPORTANCE_DEFAULT))
    }

    companion object {
        private const val TAG = "SquirrelNearby"
        private const val CHANNEL_STATUS = "nearby_status"
        private const val CHANNEL_NEARBY = "nearby_people"
        private const val STATUS_ID = 4201
        private const val NEARBY_ID = 4202

        fun start(context: Context) {
            context.startForegroundService(Intent(context, NearbyService::class.java))
        }

        /** Call when the user switches Nearby Discovery OFF (after PUT /api/nearby/settings). */
        fun stop(context: Context) {
            context.stopService(Intent(context, NearbyService::class.java))
        }
    }
}

# Nearby Discovery — mobile clients

Drop-in BLE layers for the Squirrel Social apps. The design, privacy model and full API are in
[`docs/nearby-discovery.md`](../../docs/nearby-discovery.md).

```
android/src/main/java/app/squirrelsocial/nearby/
    NearbyProtocol.kt   UUIDs, payload codec, rotation math (mirrors backend/nearby/protocol.py)
    DetectionBuffer.kt  throttled, offline-tolerant sighting buffer
    NearbyApi.kt        HTTP client for /api/proximity/*, /api/notifications/nearby
    BleAdvertiser.kt    advertises SERVICE_UUID + GATT server serving the current id
    BleScanner.kt       scans SERVICE_UUID, one GATT read per peer per rotation window
    NearbyService.kt    foreground service tying it together; shows local notifications
android/src/test/…      JVM unit tests (protocol codec, buffer)
android/AndroidManifest.snippet.xml

ios/SquirrelNearby/
    NearbyProtocol.swift, DetectionBuffer.swift, NearbyAPI.swift
    NearbyManager.swift  CBCentralManager + CBPeripheralManager on one serial queue
ios/Info.plist.snippet.xml
```

## Integrating

1. **Auth.** Sign in through `POST /api/auth/login` (or `register`) and keep the tokens in
   Keystore/Keychain. Give the BLE layer a token provider:
   `NearbyService.Config.accessToken = { tokenStore.current() }` /
   `NearbyManager.shared.accessToken = { await tokenStore.current() }`. On a 401 the client
   defers; refresh the token with `POST /api/auth/refresh`.
2. **Settings → Privacy → Nearby Discovery.** The toggle calls
   `PUT /api/nearby/settings {enabled, show_profile}`. Turning it on requests the Bluetooth (and
   notification) permissions, then starts discovery: `NearbyService.start(context)` /
   `NearbyManager.shared.start()`. Turning it off calls `stop()`. The server erases the user's
   proximity state immediately.
3. **Restart on launch** if the setting is on (`GET /api/nearby/settings`).
4. **Notifications.** A tap opens `squirrelsocial://nearby`. Route it to the Nearby screen, which
   renders `GET /api/nearby` and calls `POST /api/nearby/connect {nearby_id}`. On iOS, request
   `UNUserNotificationCenter` authorization and handle `userInfo["deep_link"]` in the delegate.
5. **Deep links.** Merge the manifest / Info.plist snippets. Set the backend env vars
   `SQUIRREL_IOS_APP_IDS`, `SQUIRREL_ANDROID_CERT_SHA256` so `https://squirrelsocial.app/join` and
   `/invite/*` open the installed app instead of the store.

## Platform notes

- **Android**: minSdk 26. Discovery runs as a `connectedDevice` foreground service with a
  low-importance status notification. Start it from the foreground (Android 12+ forbids starting
  one from the background). The advertising set restarts on each rotation so the random MAC
  changes together with the id. Android 8–11 requires a location permission for BLE scanning;
  location is never read.
- **iOS**: uses the `bluetooth-central` and `bluetooth-peripheral` background modes plus state
  restoration. Timers pause in the background, so syncs also run from Bluetooth wake-ups. While
  backgrounded, iOS moves the service UUID to its overflow area. Two backgrounded, locked iPhones
  usually won't see each other (see the design doc §7).

## Verification status

The Android sources compile cleanly against the Android 14 (API 34) framework
(`org.robolectric:android-all`), and the JVM unit tests pass. The Swift sources have not been
compiled here: no Xcode or iOS SDK was available. Both clients need on-device testing with real
phones before release, especially GATT timing, background behaviour and RSSI calibration per
device model.

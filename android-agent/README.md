# net2ool Android Agent

The companion app that collects the data a browser physically cannot reach, and
pushes it to your net2ool dashboard.

| Capability | Why it needs a native app |
| --- | --- |
| Device-wide daily data usage | `NetworkStatsManager` + Usage Access. No browser API exists. |
| Wi-Fi access point scan | `WifiManager.scanResults`. No browser API exists. |
| Bluetooth LE scan | `BluetoothLeScanner`. Web Bluetooth can only show a user-driven picker, it cannot passively scan. |
| LAN device discovery | Raw TCP sockets + ARP table. Browsers forbid both. |

---

## 1. Prerequisites

- **Android Studio** Ladybug (2024.2) or newer
- **JDK 17** (bundled with Android Studio)
- An Android device running **Android 8.0 (API 26) or newer**, on the Wi-Fi
  network you want to inspect
- Your net2ool dashboard deployed to a **public HTTPS URL** (Vercel). The agent
  refuses plaintext HTTP, so `localhost` will not work.

## 2. Generate the Gradle wrapper

This source tree ships without the `gradle-wrapper.jar` binary. Generate it once:

```bash
cd android-agent
gradle wrapper --gradle-version 8.13
```

If you do not have Gradle installed locally, skip this — Android Studio will
offer to generate the wrapper for you when you open the project.

## 3. Open and build

1. Android Studio → **File ▸ Open** → select the `android-agent` folder
2. Wait for the Gradle sync to finish (first run downloads the Android Gradle
   Plugin and dependencies)
3. Connect your device with USB debugging enabled
4. Press **Run** (or `./gradlew installDebug`)

To produce a standalone APK you can sideload:

```bash
./gradlew assembleRelease
# unsigned output:
# app/build/outputs/apk/release/app-release-unsigned.apk
```

For a signed build, create a keystore and add a `signingConfigs` block to
`app/build.gradle.kts` — see the Android
[app signing docs](https://developer.android.com/studio/publish/app-signing).

## 4. Pair the agent with your dashboard

1. Open your net2ool dashboard → **Settings ▸ Agent keys**
2. Press **Create key** and copy the key (`nsk_...`). It is shown **once** —
   the server stores only an HMAC-SHA256 hash of it.
3. Open the net2ool Agent app on your phone
4. Paste your dashboard's base URL (for example `https://net2ool.vercel.app`)
   and the agent key
5. Press **Save and test connection**

The key is stored in `EncryptedSharedPreferences`, backed by the Android
Keystore, and is never written to logs or backed up.

## 5. Grant permissions

The app's home screen lists each permission with its current state and a button
that jumps to the right settings page.

| Permission | How it is granted | What breaks without it |
| --- | --- | --- |
| **Usage access** | Manual toggle in Settings (no dialog possible) | No device-wide data usage |
| **Location** (precise) | Runtime dialog | Wi-Fi scan returns an empty list |
| **Nearby devices** | Runtime dialog (Android 12+) | No BLE camera detection |
| **Notifications** | Runtime dialog (Android 13+) | Sync runs silently |

> **Location is not optional for Wi-Fi scanning.** Since Android 8.1, Google
> gates `scanResults` behind precise location because AP lists can be used to
> geolocate a device. Denying it returns an empty array, not an error.

## 6. How syncing works

A `PeriodicWorkRequest` runs every 60 minutes (Android's minimum interval) under
WorkManager, so it survives reboots and process death. You can also press
**Sync now** at any time.

Each run:

1. Reads hourly `NetworkStatsManager` buckets since the last successful sync
   and posts them to `/api/agent/ingest` as `usage`
2. Scans Wi-Fi APs and BLE devices, posts them as `wifi` and `ble`
3. Sweeps the local subnet, fingerprints open ports, posts hosts as `devices`
4. The server correlates everything and writes threat findings

### Known platform constraints

- **Wi-Fi scan throttling**: Android 9+ limits foreground apps to 4 scans per
  2 minutes. The agent falls back to the last cached result instead of failing.
- **60-minute floor**: WorkManager's minimum periodic interval. Finer-grained
  usage tracking would require a foreground service with a persistent
  notification.
- **LAN sweep scope**: scans the device's own /24 subnet. Larger or segmented
  networks (multiple VLANs) are not enumerated.
- **MAC randomisation**: Android returns randomised MACs for BLE devices, so a
  given camera may appear under a new address between scans. The dashboard
  dedupes on address, so re-randomised devices can appear more than once.
- **ARP visibility**: Android 10+ restricts `/proc/net/arp`. The agent derives
  hosts from reachability probes instead, so MAC addresses may be unavailable
  and a synthetic `ip:` identifier is used instead.

## 7. Project layout

```
android-agent/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
└── app/
    ├── build.gradle.kts
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── res/
        └── java/app/net2ool/agent/
            ├── data/
            │   ├── AgentStore.kt      # encrypted key + URL storage
            │   └── IngestApi.kt       # wire models + HTTP client
            ├── scan/
            │   ├── UsageCollector.kt  # NetworkStatsManager
            │   ├── WifiScanner.kt     # WifiManager AP scan
            │   ├── BleScanner.kt      # BluetoothLeScanner
            │   └── LanScanner.kt      # subnet sweep + port fingerprint
            ├── work/
            │   └── SyncWorker.kt      # WorkManager periodic sync
            └── ui/
                ├── MainActivity.kt    # Compose UI + permission flow
                ├── AgentViewModel.kt
                └── Theme.kt
```

## 8. Legal and ethical use

Only scan networks you own or are authorised to test. Port scanning
infrastructure you do not control is illegal in many jurisdictions. The camera
and recorder detection exists to help you find surveillance devices in spaces
**you occupy** — it is not a tool for probing other people's networks.

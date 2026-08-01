package app.netscope.agent.scan

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import app.netscope.agent.data.WifiApDto
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume

/**
 * Enumerates nearby Wi-Fi access points so the server can flag rogue APs
 * (same SSID on an unexpected BSSID) and weak encryption (OPEN / WEP / TKIP).
 *
 * Platform constraints worth knowing:
 *  - Scan results are location-gated since Android 8.1. Without ACCESS_FINE_LOCATION
 *    *and* system location services switched on, the list comes back empty.
 *  - startScan() is throttled from Android 9: roughly 4 calls per 2 minutes per
 *    app. When throttled the call returns false, so this falls back to the
 *    cached scanResults rather than reporting nothing.
 */
class WifiScanner(private val context: Context) {

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    suspend fun scan(): List<WifiApDto> {
        if (!hasPermission()) return emptyList()
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            ?: return emptyList()

        // Ask for a fresh sweep, but treat a refusal as "use the cache".
        val requested = try {
            @Suppress("DEPRECATION")
            wifi.startScan()
        } catch (_: SecurityException) {
            false
        }

        if (requested) {
            try {
                awaitScanBroadcast()
            } catch (_: TimeoutCancellationException) {
                // Fall through to whatever the framework already has.
            }
        }

        return readResults(wifi)
    }

    /** Suspends until the framework broadcasts that results are ready. */
    private suspend fun awaitScanBroadcast() = withTimeout(SCAN_TIMEOUT_MS) {
        suspendCancellableCoroutine { cont ->
            val filter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context?, intent: Intent?) {
                    if (cont.isActive) cont.resume(Unit)
                }
            }

            ContextCompat.registerReceiver(
                context,
                receiver,
                filter,
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )

            cont.invokeOnCancellation {
                runCatching { context.unregisterReceiver(receiver) }
            }
        }
    }

    private fun readResults(wifi: WifiManager): List<WifiApDto> = try {
        wifi.scanResults
            .asSequence()
            .mapNotNull { result ->
                val bssid = result.BSSID ?: return@mapNotNull null
                val ssid = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    result.wifiSsid?.toString()?.trim('"').orEmpty()
                } else {
                    @Suppress("DEPRECATION")
                    result.SSID.orEmpty()
                }

                WifiApDto(
                    // A blank SSID means a hidden network; label it so the
                    // server does not treat every hidden AP as one identity.
                    ssid = ssid.ifBlank { "(hidden)" },
                    bssid = bssid,
                    capabilities = result.capabilities,
                    rssi = result.level,
                    frequency = result.frequency,
                )
            }
            .distinctBy { it.bssid }
            .toList()
    } catch (_: SecurityException) {
        emptyList()
    }

    private companion object {
        const val SCAN_TIMEOUT_MS = 12_000L
    }
}

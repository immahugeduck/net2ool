package app.net2ool.agent.scan

import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.net.ConnectivityManager
import android.os.Process
import app.net2ool.agent.data.UsageBucketDto
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Reads OS-level, device-wide byte counters.
 *
 * This is the one capability that genuinely cannot be reproduced in a browser:
 * no web API exposes per-interface traffic totals for the whole device. Here it
 * comes from NetworkStatsManager, which requires the PACKAGE_USAGE_STATS app-ops
 * grant (Settings > Special app access > Usage access).
 *
 * Counters are bucketed into whole UTC hours to match the web app's
 * usage_sample table, which is keyed on (userId, bucketStart, connectionType,
 * source). The agent reports absolute totals per bucket and the server
 * overwrites rather than accumulates, so re-sending an overlapping window is
 * idempotent and safe.
 */
class UsageCollector(private val context: Context) {

    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    /** True when the user has granted Usage access. */
    fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
        val mode = appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName,
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /**
     * Collects hourly totals for Wi-Fi and cellular between [sinceMillis] and now.
     *
     * @param sinceMillis start of the window. Clamped to at most [maxHours] back
     *   so a first run after a long gap cannot produce an enormous payload.
     */
    fun collect(sinceMillis: Long, maxHours: Int = 72): List<UsageBucketDto> {
        if (!hasUsageAccess()) return emptyList()

        val manager = context.getSystemService(Context.NETWORK_STATS_SERVICE) as? NetworkStatsManager
            ?: return emptyList()

        val now = System.currentTimeMillis()
        val earliest = now - maxHours * HOUR_MS
        // Always re-send the current (still-growing) hour so the latest figure
        // stays fresh, hence the minus-one-hour floor.
        var cursor = floorToHour(maxOf(sinceMillis - HOUR_MS, earliest))

        val out = ArrayList<UsageBucketDto>()

        while (cursor < now) {
            val end = minOf(cursor + HOUR_MS, now)
            val label = iso.format(Date(cursor))

            for ((networkType, name) in TYPES) {
                val bucket = querySummary(manager, networkType, cursor, end) ?: continue
                if (bucket.first == 0L && bucket.second == 0L) continue
                out += UsageBucketDto(
                    bucketStart = label,
                    rxBytes = bucket.first,
                    txBytes = bucket.second,
                    connectionType = name,
                )
            }
            cursor += HOUR_MS
        }
        return out
    }

    /** Returns rx/tx for one interface over one window, or null if unavailable. */
    private fun querySummary(
        manager: NetworkStatsManager,
        networkType: Int,
        start: Long,
        end: Long,
    ): Pair<Long, Long>? = try {
        // Passing a null subscriber id asks for all subscribers. Reading the
        // real IMSI needs READ_PHONE_STATE and is not required for totals.
        val bucket: NetworkStats.Bucket = manager.querySummaryForDevice(networkType, null, start, end)
        bucket.rxBytes to bucket.txBytes
    } catch (_: SecurityException) {
        // Usage access was revoked between the check and this call.
        null
    } catch (_: Exception) {
        // Some OEM builds throw RemoteException or IllegalStateException for
        // interfaces the device does not have (cellular on a Wi-Fi-only tablet).
        null
    }

    private fun floorToHour(millis: Long) = millis - (millis % HOUR_MS)

    private companion object {
        const val HOUR_MS = 3_600_000L
        val TYPES = listOf(
            ConnectivityManager.TYPE_WIFI to "wifi",
            ConnectivityManager.TYPE_MOBILE to "cellular",
            ConnectivityManager.TYPE_ETHERNET to "ethernet",
        )
    }
}

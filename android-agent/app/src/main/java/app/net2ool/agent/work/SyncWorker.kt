package app.net2ool.agent.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.net2ool.agent.data.AgentStore
import app.net2ool.agent.data.ApiResult
import app.net2ool.agent.data.IngestApi
import app.net2ool.agent.data.IngestRequest
import app.net2ool.agent.scan.BleScanner
import app.net2ool.agent.scan.LanScanner
import app.net2ool.agent.scan.UsageCollector
import app.net2ool.agent.scan.WifiScanner
import java.util.concurrent.TimeUnit

/**
 * Runs a full collection pass and uploads it.
 *
 * Every stage is independently optional: if a permission is missing or a radio
 * is off, that section is simply omitted from the payload. The agent never
 * fabricates a reading to fill a gap, which is what keeps the dashboard
 * trustworthy.
 */
class SyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val store = AgentStore(applicationContext)
        if (!store.isConfigured) return Result.failure()

        val api = IngestApi(store)

        val usageCollector = UsageCollector(applicationContext)
        val since = if (store.usageCursor > 0) store.usageCursor else System.currentTimeMillis() - DAY_MS

        val usage = runCatching { usageCollector.collect(since) }.getOrDefault(emptyList())
        val wifiAps = runCatching { WifiScanner(applicationContext).scan() }.getOrDefault(emptyList())
        val bleDevices = runCatching { BleScanner(applicationContext).scan() }.getOrDefault(emptyList())
        val lanHosts = runCatching { LanScanner(applicationContext).scan() }.getOrDefault(emptyList())

        val payload = IngestRequest(
            lanHosts = lanHosts,
            bleDevices = bleDevices,
            wifiAps = wifiAps,
            usage = usage,
        )

        // Nothing collected means nothing to say. Reporting an empty payload
        // would make the server mark every device offline.
        if (payload.lanHosts.isEmpty() &&
            payload.bleDevices.isEmpty() &&
            payload.wifiAps.isEmpty() &&
            payload.usage.isEmpty()
        ) {
            store.lastResult = "Nothing collected — check permissions"
            return Result.success()
        }

        return when (val result = api.push(payload)) {
            is ApiResult.Ok -> {
                val body = result.value
                store.lastSyncAt = System.currentTimeMillis()
                store.usageCursor = System.currentTimeMillis()
                store.lastResult = buildString {
                    append("${body.devicesUpserted} devices, ")
                    append("${body.usageUpserted} usage buckets, ")
                    append("${body.findings} findings")
                }
                Result.success()
            }

            is ApiResult.Failure -> {
                store.lastResult = result.message
                // A revoked key will never succeed, so stop retrying it.
                if (result.status == 401) Result.failure() else Result.retry()
            }
        }
    }

    companion object {
        private const val DAY_MS = 86_400_000L
        const val PERIODIC_NAME = "net2ool-periodic-sync"
        const val ONE_SHOT_NAME = "net2ool-manual-sync"

        /**
         * Schedules recurring sync. WorkManager enforces a 15 minute floor on
         * periodic work, so that is the shortest usable interval.
         */
        fun schedule(context: Context, intervalMinutes: Long = 60L) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<SyncWorker>(
                intervalMinutes.coerceAtLeast(15L),
                TimeUnit.MINUTES,
            )
                .setConstraints(constraints)
                .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 5, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
        }

        /** Fires an immediate pass, used by the "Sync now" button. */
        fun runNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                ONE_SHOT_NAME,
                androidx.work.ExistingWorkPolicy.REPLACE,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_NAME)
        }
    }
}

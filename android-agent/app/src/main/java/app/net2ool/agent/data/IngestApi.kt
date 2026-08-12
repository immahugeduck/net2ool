package app.net2ool.agent.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/*
 * Wire models. Field names must match the Zod/TS interfaces consumed by
 * POST /api/agent/ingest exactly — see lib/threats.ts in the web app.
 */

@Serializable
data class LanHostDto(
    val ip: String,
    val mac: String? = null,
    val hostname: String? = null,
    val vendor: String? = null,
    val openPorts: List<Int> = emptyList(),
    val banners: Map<String, String> = emptyMap(),
)

@Serializable
data class BleDeviceDto(
    val address: String,
    val name: String? = null,
    val rssi: Int? = null,
    val manufacturerId: Int? = null,
)

@Serializable
data class WifiApDto(
    val ssid: String,
    val bssid: String,
    val capabilities: String? = null,
    val rssi: Int? = null,
    val frequency: Int? = null,
)

@Serializable
data class UsageBucketDto(
    /** ISO-8601 UTC instant marking the start of the hour. */
    val bucketStart: String,
    val rxBytes: Long,
    val txBytes: Long,
    /** "wifi" | "cellular" | "ethernet" | "unknown" */
    val connectionType: String,
)

@Serializable
data class IngestRequest(
    val lanHosts: List<LanHostDto> = emptyList(),
    val bleDevices: List<BleDeviceDto> = emptyList(),
    val wifiAps: List<WifiApDto> = emptyList(),
    val usage: List<UsageBucketDto> = emptyList(),
)

@Serializable
data class IngestReceived(
    val lanHosts: Int = 0,
    val bleDevices: Int = 0,
    val wifiAps: Int = 0,
    val usageBuckets: Int = 0,
)

@Serializable
data class IngestResponse(
    val ok: Boolean = false,
    val received: IngestReceived = IngestReceived(),
    val devicesUpserted: Int = 0,
    val usageUpserted: Int = 0,
    val findings: Int = 0,
)

sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Failure(val message: String, val status: Int? = null) : ApiResult<Nothing>
}

class IngestApi(private val store: AgentStore) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private fun endpoint() = "${store.serverUrl}/api/agent/ingest"

    /** Cheap credential check so the UI can validate pairing without a full scan. */
    suspend fun verify(): ApiResult<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val request = Request.Builder()
                .url(endpoint())
                .header("Authorization", "Bearer ${store.agentKey}")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    ApiResult.Ok(true)
                } else {
                    ApiResult.Failure(describe(response.code), response.code)
                }
            }
        }.getOrElse { ApiResult.Failure(it.message ?: "Network error") }
    }

    suspend fun push(payload: IngestRequest): ApiResult<IngestResponse> = withContext(Dispatchers.IO) {
        runCatching {
            val body = json.encodeToString(IngestRequest.serializer(), payload)
                .toRequestBody("application/json; charset=utf-8".toMediaType())

            val request = Request.Builder()
                .url(endpoint())
                .header("Authorization", "Bearer ${store.agentKey}")
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    ApiResult.Ok(json.decodeFromString(IngestResponse.serializer(), text))
                } else {
                    ApiResult.Failure(describe(response.code), response.code)
                }
            }
        }.getOrElse { ApiResult.Failure(it.message ?: "Network error") }
    }

    private fun describe(code: Int) = when (code) {
        401 -> "Agent key rejected. It may have been revoked — create a new key in net2ool settings."
        404 -> "Endpoint not found. Check the server URL."
        429 -> "Rate limited by the server. The next scheduled sync will retry."
        in 500..599 -> "Server error ($code). The next scheduled sync will retry."
        else -> "Request failed with HTTP $code."
    }
}

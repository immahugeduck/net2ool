package app.netscope.agent.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists the agent key and server URL.
 *
 * The key is a bearer credential that grants write access to the user's
 * NetScope account, so it is stored in EncryptedSharedPreferences (AES-256-GCM,
 * key material held in the hardware-backed keystore) rather than plain prefs.
 */
class AgentStore(context: Context) {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "netscope_agent",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var serverUrl: String
        get() = prefs.getString(KEY_SERVER, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SERVER, value.trim().trimEnd('/')).apply()

    var agentKey: String
        get() = prefs.getString(KEY_AGENT, "") ?: ""
        set(value) = prefs.edit().putString(KEY_AGENT, value.trim()).apply()

    /** Epoch millis of the last successful sync, or 0 if never. */
    var lastSyncAt: Long
        get() = prefs.getLong(KEY_LAST_SYNC, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_SYNC, value).apply()

    var lastResult: String
        get() = prefs.getString(KEY_LAST_RESULT, "") ?: ""
        set(value) = prefs.edit().putString(KEY_LAST_RESULT, value).apply()

    /**
     * Highest hour bucket already accepted by the server. Sync resumes from
     * here so a reinstall or long offline period backfills instead of
     * silently losing history.
     */
    var usageCursor: Long
        get() = prefs.getLong(KEY_CURSOR, 0L)
        set(value) = prefs.edit().putLong(KEY_CURSOR, value).apply()

    val isConfigured: Boolean
        get() = serverUrl.isNotEmpty() && agentKey.isNotEmpty()

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val KEY_SERVER = "server_url"
        const val KEY_AGENT = "agent_key"
        const val KEY_LAST_SYNC = "last_sync_at"
        const val KEY_LAST_RESULT = "last_result"
        const val KEY_CURSOR = "usage_cursor"
    }
}

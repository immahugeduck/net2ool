package app.netscope.agent.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.netscope.agent.data.AgentStore
import app.netscope.agent.data.ApiResult
import app.netscope.agent.data.IngestApi
import app.netscope.agent.scan.BleScanner
import app.netscope.agent.scan.UsageCollector
import app.netscope.agent.scan.WifiScanner
import app.netscope.agent.work.SyncWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AgentUiState(
    val serverUrl: String = "",
    val agentKey: String = "",
    val paired: Boolean = false,
    val verifying: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    val lastSyncAt: Long = 0L,
    val lastResult: String = "",
    val hasUsageAccess: Boolean = false,
    val hasLocation: Boolean = false,
    val hasBluetooth: Boolean = false,
    val syncIntervalMinutes: Long = 60L,
)

class AgentViewModel(app: Application) : AndroidViewModel(app) {

    private val store = AgentStore(app)
    private val api = IngestApi(store)

    private val _state = MutableStateFlow(AgentUiState())
    val state: StateFlow<AgentUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    /** Re-reads persisted config and live permission status. */
    fun refresh() {
        val app = getApplication<Application>()
        _state.value = _state.value.copy(
            serverUrl = store.serverUrl,
            agentKey = store.agentKey,
            paired = store.isConfigured,
            lastSyncAt = store.lastSyncAt,
            lastResult = store.lastResult,
            hasUsageAccess = UsageCollector(app).hasUsageAccess(),
            hasLocation = WifiScanner(app).hasPermission(),
            hasBluetooth = BleScanner(app).hasPermission(),
        )
    }

    fun onServerUrlChange(value: String) {
        _state.value = _state.value.copy(serverUrl = value, error = null)
    }

    fun onAgentKeyChange(value: String) {
        _state.value = _state.value.copy(agentKey = value, error = null)
    }

    /** Validates the credentials against the server before storing them. */
    fun pair() {
        val current = _state.value
        val url = current.serverUrl.trim().trimEnd('/')
        val key = current.agentKey.trim()

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            _state.value = current.copy(error = "Server URL must start with https://")
            return
        }
        if (key.isEmpty()) {
            _state.value = current.copy(error = "Paste the agent key from NetScope settings")
            return
        }

        _state.value = current.copy(verifying = true, error = null, message = null)

        viewModelScope.launch {
            // Persist first so the API client reads the new values, then roll
            // back if the server rejects them.
            val previousUrl = store.serverUrl
            val previousKey = store.agentKey
            store.serverUrl = url
            store.agentKey = key

            when (val result = api.verify()) {
                is ApiResult.Ok -> {
                    SyncWorker.schedule(getApplication(), _state.value.syncIntervalMinutes)
                    SyncWorker.runNow(getApplication())
                    _state.value = _state.value.copy(
                        verifying = false,
                        paired = true,
                        message = "Paired. First sync started.",
                    )
                    refresh()
                }

                is ApiResult.Failure -> {
                    store.serverUrl = previousUrl
                    store.agentKey = previousKey
                    _state.value = _state.value.copy(verifying = false, error = result.message)
                }
            }
        }
    }

    fun syncNow() {
        if (!store.isConfigured) return
        SyncWorker.runNow(getApplication())
        _state.value = _state.value.copy(message = "Sync queued.")
    }

    fun setInterval(minutes: Long) {
        _state.value = _state.value.copy(syncIntervalMinutes = minutes)
        if (store.isConfigured) SyncWorker.schedule(getApplication(), minutes)
    }

    fun unpair() {
        SyncWorker.cancel(getApplication())
        store.clear()
        _state.value = AgentUiState(message = "Agent unpaired. Revoke the key in NetScope too.")
        refresh()
    }

    fun dismissMessage() {
        _state.value = _state.value.copy(message = null, error = null)
    }
}

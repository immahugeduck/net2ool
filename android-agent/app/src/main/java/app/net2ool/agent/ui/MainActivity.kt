package app.net2ool.agent.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.text.DateFormat
import java.util.Date

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            Net2oolAgentTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AgentScreen()
                }
            }
        }
    }
}

@Composable
private fun AgentScreen(viewModel: AgentViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = androidx.compose.ui.platform.LocalContext.current

    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { viewModel.refresh() }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "net2ool Agent",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Collects device-wide data usage, LAN devices, Wi-Fi access points, " +
                    "and BLE devices, then reports them to your net2ool dashboard.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // ---- Pairing ----
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Pairing", fontWeight = FontWeight.SemiBold)

                    OutlinedTextField(
                        value = state.serverUrl,
                        onValueChange = viewModel::onServerUrlChange,
                        label = { Text("Dashboard URL") },
                        placeholder = { Text("https://your-app.vercel.app") },
                        singleLine = true,
                        enabled = !state.paired,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    OutlinedTextField(
                        value = state.agentKey,
                        onValueChange = viewModel::onAgentKeyChange,
                        label = { Text("Agent key") },
                        placeholder = { Text("nsk_...") },
                        singleLine = true,
                        enabled = !state.paired,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    if (state.paired) {
                        Text(
                            "Paired. Syncing every ${state.syncIntervalMinutes} minutes.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = viewModel::syncNow) { Text("Sync now") }
                            OutlinedButton(onClick = viewModel::unpair) { Text("Unpair") }
                        }
                    } else {
                        Button(
                            onClick = viewModel::pair,
                            enabled = !state.verifying,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(if (state.verifying) "Verifying..." else "Pair with dashboard")
                        }
                    }

                    state.error?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    state.message?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            // ---- Permissions ----
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Permissions", fontWeight = FontWeight.SemiBold)
                    Text(
                        "Each grant unlocks one capability. Anything not granted is simply " +
                            "left out of the report — no estimated or placeholder values are ever sent.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    PermissionRow(
                        label = "Usage access",
                        detail = "Device-wide data totals (NetworkStatsManager)",
                        granted = state.hasUsageAccess,
                        onFix = {
                            // This one has no runtime dialog; it can only be
                            // toggled in system settings.
                            context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                        },
                    )

                    PermissionRow(
                        label = "Location",
                        detail = "Required by Android for Wi-Fi scan results",
                        granted = state.hasLocation,
                        onFix = {
                            permissionLauncher.launch(
                                arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION,
                                ),
                            )
                        },
                    )

                    PermissionRow(
                        label = "Nearby devices",
                        detail = "BLE scan for cameras and recorders",
                        granted = state.hasBluetooth,
                        onFix = {
                            val perms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                arrayOf(Manifest.permission.BLUETOOTH_SCAN)
                            } else {
                                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
                            }
                            permissionLauncher.launch(perms)
                        },
                    )

                    TextButton(onClick = viewModel::refresh) { Text("Re-check permissions") }
                }
            }

            // ---- Status ----
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Last sync", fontWeight = FontWeight.SemiBold)
                    Text(
                        text = if (state.lastSyncAt == 0L) {
                            "Never"
                        } else {
                            DateFormat.getDateTimeInstance().format(Date(state.lastSyncAt))
                        },
                        fontFamily = FontFamily.Monospace,
                    )
                    if (state.lastResult.isNotEmpty()) {
                        Text(
                            state.lastResult,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // ---- Sync interval ----
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Sync interval", fontWeight = FontWeight.SemiBold)
                    Text(
                        "Android enforces a 15 minute minimum for periodic background work.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(15L, 60L, 180L).forEach { minutes ->
                            val selected = state.syncIntervalMinutes == minutes
                            if (selected) {
                                Button(onClick = { viewModel.setInterval(minutes) }) {
                                    Text("${minutes}m")
                                }
                            } else {
                                OutlinedButton(onClick = { viewModel.setInterval(minutes) }) {
                                    Text("${minutes}m")
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun PermissionRow(
    label: String,
    detail: String,
    granted: Boolean,
    onFix: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text(
                detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (granted) {
            Text(
                "Granted",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            OutlinedButton(onClick = onFix) { Text("Grant") }
        }
    }
}

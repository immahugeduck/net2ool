package app.netscope.agent.scan

import android.Manifest
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import app.netscope.agent.data.BleDeviceDto
import kotlinx.coroutines.delay

/**
 * Passive BLE sweep. Nearby cameras, doorbells, and recorders very often
 * advertise over Bluetooth Low Energy, so the advertised name plus the
 * manufacturer ID is a strong signal the server can match against known
 * camera vendors.
 *
 * A browser cannot do this at all: Web Bluetooth only offers a user-driven
 * device picker, never a passive background scan.
 *
 * Permission model differs by version:
 *  - API 31+: BLUETOOTH_SCAN (runtime)
 *  - API 26-30: BLUETOOTH + BLUETOOTH_ADMIN (install-time) plus location
 */
class BleScanner(private val context: Context) {

    fun hasPermission(): Boolean {
        val required = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Manifest.permission.BLUETOOTH_SCAN
        } else {
            Manifest.permission.ACCESS_FINE_LOCATION
        }
        return ContextCompat.checkSelfPermission(context, required) == PackageManager.PERMISSION_GRANTED
    }

    /** Scans for [durationMs], de-duplicating by MAC and keeping the strongest RSSI. */
    suspend fun scan(durationMs: Long = 10_000L): List<BleDeviceDto> {
        if (!hasPermission()) return emptyList()

        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            ?: return emptyList()
        val adapter = manager.adapter ?: return emptyList()
        if (!adapter.isEnabled) return emptyList()
        val scanner = adapter.bluetoothLeScanner ?: return emptyList()

        val found = LinkedHashMap<String, BleDeviceDto>()

        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult?) {
                val record = result ?: return
                val address = record.device?.address ?: return

                val name = runCatching { record.device?.name }.getOrNull()
                    ?: record.scanRecord?.deviceName

                // manufacturerSpecificData is a SparseArray keyed by company ID.
                val manufacturerId = record.scanRecord
                    ?.manufacturerSpecificData
                    ?.takeIf { it.size() > 0 }
                    ?.keyAt(0)

                val dto = BleDeviceDto(
                    address = address,
                    name = name?.takeIf { it.isNotBlank() },
                    rssi = record.rssi,
                    manufacturerId = manufacturerId,
                )

                // Called on a binder thread; guard the map without suspending.
                synchronized(found) {
                    val existing = found[address]
                    // Prefer the sighting that carries a name, then the stronger signal.
                    val better = existing == null ||
                        (dto.name != null && existing.name == null) ||
                        ((dto.rssi ?: -127) > (existing.rssi ?: -127) && dto.name != null)
                    if (better) found[address] = dto
                }
            }

            override fun onScanFailed(errorCode: Int) {
                // Nothing to report; an empty list is the honest result.
            }
        }

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        return try {
            scanner.startScan(null, settings, callback)
            delay(durationMs)
            synchronized(found) { found.values.toList() }
        } catch (_: SecurityException) {
            emptyList()
        } finally {
            runCatching { scanner.stopScan(callback) }
        }
    }
}

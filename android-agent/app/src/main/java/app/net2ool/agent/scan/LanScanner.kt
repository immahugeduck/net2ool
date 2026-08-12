package app.net2ool.agent.scan

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkAddress
import app.net2ool.agent.data.LanHostDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.InputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException

/**
 * Discovers hosts on the local subnet and fingerprints them by open port.
 *
 * There is no browser equivalent: JavaScript has no raw sockets and no LAN
 * scanning API, which is exactly why this work belongs in the agent.
 *
 * Strategy, cheapest signal first:
 *  1. Enumerate the IPv4 subnet from the active network's LinkProperties.
 *  2. Probe every address in parallel (bounded) with a short TCP connect and
 *     an ICMP-style reachability check.
 *  3. For hosts that answer, sweep a focused port list and grab a banner.
 *  4. Try to resolve MACs from the kernel ARP cache.
 *
 * MAC caveat, stated honestly: /proc/net/arp is unreadable to normal apps from
 * Android 10 onward. When a MAC cannot be resolved the host is reported with
 * its IP only, and the server falls back to an `ip:` identity. Vendor
 * attribution from the OUI prefix is therefore best-effort on modern Android.
 */
class LanScanner(private val context: Context) {

    /** Ports worth probing: camera/NVR signatures plus genuinely risky services. */
    private val portsToProbe = intArrayOf(
        21, 22, 23, 80, 443, 445, 554, 1900, 1935, 3389, 3702,
        5000, 5900, 8000, 8080, 8081, 8443, 8554, 8899, 9000, 34567, 37777,
    )

    suspend fun scan(): List<LanHostDto> = withContext(Dispatchers.IO) {
        val prefix = activeIpv4Prefix() ?: return@withContext emptyList()
        val arp = readArpCache()

        // Only /24 and smaller are swept. A /16 would be 65k probes, which is
        // hostile to the battery and to the network.
        val hostBits = 32 - prefix.prefixLength
        if (hostBits > 8) return@withContext emptyList()

        val base = prefix.address.address ?: return@withContext emptyList()
        if (base.size != 4) return@withContext emptyList()

        val candidates = (1..254).map { last ->
            val octets = base.copyOf()
            octets[3] = last.toByte()
            InetAddress.getByAddress(octets).hostAddress ?: ""
        }.filter { it.isNotEmpty() }

        // Bound concurrency so we do not exhaust file descriptors.
        val alive = candidates.chunked(CONCURRENCY).flatMap { chunk ->
            coroutineScope {
                chunk.map { ip -> async { if (isReachable(ip)) ip else null } }.awaitAll()
            }.filterNotNull()
        }

        alive.chunked(16).flatMap { chunk ->
            coroutineScope {
                chunk.map { ip ->
                    async {
                        val open = sweepPorts(ip)
                        val banners = grabBanners(ip, open)
                        LanHostDto(
                            ip = ip,
                            mac = arp[ip],
                            hostname = resolveHostname(ip),
                            openPorts = open,
                            banners = banners,
                        )
                    }
                }.awaitAll()
            }
        }
    }

    /** The IPv4 address and prefix length of the active network, if any. */
    private fun activeIpv4Prefix(): LinkAddress? {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return null
        val network = cm.activeNetwork ?: return null
        val props = cm.getLinkProperties(network) ?: return null
        return props.linkAddresses.firstOrNull {
            it.address.address?.size == 4 && !it.address.isLoopbackAddress
        }
    }

    /**
     * A host is considered present if it answers ICMP or accepts a TCP
     * connection on a common port. Many devices ignore ping but still listen,
     * so both signals matter.
     */
    private suspend fun isReachable(ip: String): Boolean {
        val icmp = withTimeoutOrNull(PING_TIMEOUT_MS.toLong()) {
            runCatching { InetAddress.getByName(ip).isReachable(PING_TIMEOUT_MS) }.getOrDefault(false)
        } ?: false
        if (icmp) return true

        return QUICK_PORTS.any { canConnect(ip, it, QUICK_TIMEOUT_MS) }
    }

    private fun sweepPorts(ip: String): List<Int> =
        portsToProbe.filter { canConnect(ip, it, PORT_TIMEOUT_MS) }

    private fun canConnect(ip: String, port: Int, timeoutMs: Int): Boolean = try {
        Socket().use { socket ->
            socket.connect(InetSocketAddress(ip, port), timeoutMs)
            true
        }
    } catch (_: Exception) {
        false
    }

    /**
     * Reads the first line a service emits, or the HTTP Server header. Banners
     * are what let the server distinguish a Hikvision NVR from a printer.
     */
    private fun grabBanners(ip: String, openPorts: List<Int>): Map<String, String> {
        val banners = HashMap<String, String>()
        for (port in openPorts.take(6)) {
            val banner = runCatching {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(ip, port), PORT_TIMEOUT_MS)
                    socket.soTimeout = BANNER_TIMEOUT_MS

                    // HTTP-ish ports need a nudge before they say anything.
                    if (port in HTTP_PORTS) {
                        socket.getOutputStream().write(
                            "HEAD / HTTP/1.0\r\nHost: $ip\r\n\r\n".toByteArray(),
                        )
                        socket.getOutputStream().flush()
                    }
                    readSnippet(socket.getInputStream())
                }
            }.getOrNull()

            if (!banner.isNullOrBlank()) banners[port.toString()] = banner
        }
        return banners
    }

    private fun readSnippet(stream: InputStream): String {
        val buffer = ByteArray(512)
        var total = 0
        try {
            while (total < buffer.size) {
                val read = stream.read(buffer, total, buffer.size - total)
                if (read <= 0) break
                total += read
                if (total > 64) break
            }
        } catch (_: SocketTimeoutException) {
            // Partial data is still useful.
        }
        if (total <= 0) return ""
        return String(buffer, 0, total)
            .replace(Regex("[^\\x20-\\x7E\\r\\n]"), "")
            .lineSequence()
            .map { it.trim() }
            .firstOrNull { it.isNotEmpty() }
            ?.take(200)
            .orEmpty()
    }

    /** Reverse DNS, but only when the router actually answers quickly. */
    private fun resolveHostname(ip: String): String? = runCatching {
        val name = InetAddress.getByName(ip).canonicalHostName
        // getCanonicalHostName echoes the IP back when resolution fails.
        if (name == ip) null else name
    }.getOrNull()

    /**
     * Parses /proc/net/arp for IP -> MAC pairs. Returns empty on Android 10+,
     * where the file is no longer world-readable.
     */
    private fun readArpCache(): Map<String, String> = runCatching {
        val file = File("/proc/net/arp")
        if (!file.canRead()) return emptyMap()

        file.readLines()
            .drop(1)
            .mapNotNull { line ->
                val cols = line.split(Regex("\\s+")).filter { it.isNotBlank() }
                if (cols.size < 4) return@mapNotNull null
                val ip = cols[0]
                val mac = cols[3]
                if (mac == "00:00:00:00:00:00" || !mac.contains(':')) null else ip to mac
            }
            .toMap()
    }.getOrDefault(emptyMap())

    private companion object {
        const val CONCURRENCY = 48
        const val PING_TIMEOUT_MS = 220
        const val QUICK_TIMEOUT_MS = 180
        const val PORT_TIMEOUT_MS = 320
        const val BANNER_TIMEOUT_MS = 700
        val QUICK_PORTS = intArrayOf(80, 443, 22, 554, 8080)
        val HTTP_PORTS = setOf(80, 443, 8000, 8080, 8081, 8443, 9000)
    }
}

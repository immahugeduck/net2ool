/**
 * Threat analysis rules.
 *
 * Everything here is evidence-based: a finding is only produced when a scan
 * actually observed the port, name, SSID, or statistical deviation described.
 * Nothing is inferred or invented, and every finding carries the raw evidence
 * so the user can judge it themselves.
 */

import { isCameraVendor } from "@/lib/oui"
import { meanAndStdDev } from "@/lib/usage"

export type Severity = "critical" | "high" | "medium" | "low" | "info"

export interface Finding {
  category: string
  severity: Severity
  title: string
  description: string
  evidence: Record<string, unknown>
  sourceType: "wifi_scan" | "ble_scan" | "lan_scan" | "analytics"
  identifier: string
}

/** Ports that strongly indicate IP cameras, NVRs, or DVRs. */
export const CAMERA_PORT_SIGNATURES: Record<number, { name: string; severity: Severity }> = {
  554: { name: "RTSP video stream", severity: "high" },
  8554: { name: "RTSP (alternate port)", severity: "high" },
  3702: { name: "ONVIF WS-Discovery", severity: "high" },
  37777: { name: "Dahua DVR/NVR control", severity: "high" },
  34567: { name: "Xiongmai/Sofia DVR", severity: "high" },
  8899: { name: "Generic DVR control", severity: "medium" },
  1935: { name: "RTMP media stream", severity: "medium" },
  8000: { name: "Hikvision SDK / camera web UI", severity: "medium" },
  8081: { name: "MJPEG stream", severity: "medium" },
  9000: { name: "Camera web service", severity: "low" },
  5000: { name: "UPnP / camera service", severity: "low" },
}

/** Ports that are a genuine security concern regardless of device class. */
export const RISKY_PORT_SIGNATURES: Record<number, { name: string; severity: Severity; why: string }> = {
  23: { name: "Telnet", severity: "critical", why: "Telnet sends credentials in clear text and is a primary IoT botnet vector." },
  21: { name: "FTP", severity: "high", why: "Plain FTP transmits credentials and file contents unencrypted." },
  445: { name: "SMB", severity: "high", why: "SMB exposed on a LAN is a common ransomware lateral-movement path." },
  3389: { name: "RDP", severity: "high", why: "Exposed RDP is heavily targeted by credential-stuffing attacks." },
  22: { name: "SSH", severity: "low", why: "SSH is encrypted, but confirm this device is meant to accept remote logins." },
  5900: { name: "VNC", severity: "high", why: "VNC often ships with weak or no authentication." },
  1900: { name: "UPnP SSDP", severity: "medium", why: "UPnP can silently open router ports to the internet." },
}

/** Substrings in BLE advertised names that indicate a camera or recorder. */
const BLE_CAMERA_NAME_HINTS = [
  "cam",
  "ipc",
  "dvr",
  "nvr",
  "gopro",
  "insta360",
  "dji",
  "arlo",
  "wyze",
  "ring",
  "eufy",
  "blink",
  "tapo",
  "reolink",
  "hikvision",
  "dahua",
  "doorbell",
  "spycam",
  "bodycam",
  "dashcam",
]

export interface LanHost {
  ip: string
  mac?: string | null
  hostname?: string | null
  vendor?: string | null
  openPorts?: number[]
  banners?: Record<string, string>
}

export interface BleDevice {
  address: string
  name?: string | null
  rssi?: number | null
  manufacturerId?: number | null
}

export interface WifiAp {
  ssid: string
  bssid: string
  /** e.g. "WPA2", "WPA3", "WEP", "OPEN" */
  capabilities?: string | null
  rssi?: number | null
  frequency?: number | null
}

function normalizeCaps(caps?: string | null) {
  return (caps ?? "").toUpperCase()
}

/** Analyzes LAN scan hosts for camera fingerprints and risky exposed services. */
export function analyzeLanHosts(hosts: LanHost[]): Finding[] {
  const findings: Finding[] = []

  for (const host of hosts) {
    const ports = host.openPorts ?? []
    const key = host.mac || host.ip

    const cameraPorts = ports.filter((p) => p in CAMERA_PORT_SIGNATURES)
    const vendorIsCamera = host.mac ? isCameraVendor(host.mac) : false

    if (cameraPorts.length > 0 || vendorIsCamera) {
      // Two independent signals agreeing raises confidence to high.
      const severity: Severity = cameraPorts.length > 0 && vendorIsCamera ? "high" : cameraPorts.length > 0 ? "medium" : "low"

      const reasons = [
        ...cameraPorts.map((p) => `port ${p} (${CAMERA_PORT_SIGNATURES[p].name})`),
        ...(vendorIsCamera ? [`MAC vendor ${host.vendor ?? "known camera manufacturer"}`] : []),
      ]

      findings.push({
        category: "camera_device",
        severity,
        title: `Possible camera or recorder at ${host.ip}`,
        description: `Detected via ${reasons.join(", ")}. Confirm this is a device you own. If you do not recognize it, isolate it on a guest network and change your Wi-Fi password.`,
        evidence: {
          ip: host.ip,
          mac: host.mac ?? null,
          hostname: host.hostname ?? null,
          vendor: host.vendor ?? null,
          matchedPorts: cameraPorts,
          allOpenPorts: ports,
          banners: host.banners ?? {},
        },
        sourceType: "lan_scan",
        identifier: `camera:${key}`,
      })
    }

    for (const port of ports) {
      const sig = RISKY_PORT_SIGNATURES[port]
      if (!sig) continue
      findings.push({
        category: "open_port",
        severity: sig.severity,
        title: `${sig.name} open on ${host.ip}`,
        description: sig.why,
        evidence: {
          ip: host.ip,
          mac: host.mac ?? null,
          port,
          service: sig.name,
          hostname: host.hostname ?? null,
        },
        sourceType: "lan_scan",
        identifier: `port:${key}:${port}`,
      })
    }
  }

  return findings
}

/** Flags BLE advertisements whose names match camera/recorder patterns. */
export function analyzeBleDevices(devices: BleDevice[]): Finding[] {
  const findings: Finding[] = []

  for (const device of devices) {
    const name = (device.name ?? "").trim()
    if (!name) continue
    const lower = name.toLowerCase()
    const hit = BLE_CAMERA_NAME_HINTS.find((hint) => lower.includes(hint))
    if (!hit) continue

    // RSSI above -60 dBm generally means the device is within a few meters.
    const veryClose = typeof device.rssi === "number" && device.rssi > -60

    findings.push({
      category: "ble_camera",
      severity: veryClose ? "high" : "medium",
      title: `Bluetooth camera signature: "${name}"`,
      description: `A nearby Bluetooth device advertises the name "${name}", which matches the pattern "${hit}". ${
        veryClose ? "Signal strength suggests it is within a few meters." : "Signal strength suggests it is further away."
      } Bluetooth names are self-reported, so verify physically before drawing conclusions.`,
      evidence: {
        address: device.address,
        name,
        rssi: device.rssi ?? null,
        manufacturerId: device.manufacturerId ?? null,
        matchedPattern: hit,
      },
      sourceType: "ble_scan",
      identifier: `ble:${device.address}`,
    })
  }

  return findings
}

/**
 * Flags weak Wi-Fi encryption and likely evil-twin access points (same SSID
 * advertised by multiple BSSIDs that are not part of one mesh vendor).
 */
export function analyzeWifiAps(aps: WifiAp[]): Finding[] {
  const findings: Finding[] = []

  for (const ap of aps) {
    const caps = normalizeCaps(ap.capabilities)
    const isOpen = caps === "" || caps === "OPEN" || (!caps.includes("WPA") && !caps.includes("WEP") && !caps.includes("RSN"))
    const isWep = caps.includes("WEP")

    if (isWep || isOpen) {
      findings.push({
        category: "weak_encryption",
        severity: isWep ? "high" : "medium",
        title: `${isWep ? "WEP" : "Unencrypted"} network in range: ${ap.ssid || "(hidden SSID)"}`,
        description: isWep
          ? "WEP encryption is broken and can be cracked in minutes. If this is your network, switch to WPA2 or WPA3 immediately."
          : "This network has no encryption, so all traffic on it is readable by anyone in range. Avoid connecting to it.",
        evidence: { ssid: ap.ssid, bssid: ap.bssid, capabilities: ap.capabilities ?? null, rssi: ap.rssi ?? null },
        sourceType: "wifi_scan",
        identifier: `enc:${ap.bssid}`,
      })
    }
  }

  // Evil-twin heuristic: one SSID, several BSSIDs with differing security.
  const bySsid = new Map<string, WifiAp[]>()
  for (const ap of aps) {
    if (!ap.ssid) continue
    const list = bySsid.get(ap.ssid) ?? []
    list.push(ap)
    bySsid.set(ap.ssid, list)
  }

  for (const [ssid, group] of bySsid) {
    if (group.length < 2) continue
    const capsSet = new Set(group.map((ap) => normalizeCaps(ap.capabilities)))
    // Mesh systems legitimately repeat an SSID, but they use identical security
    // settings. Differing capabilities across BSSIDs is the real red flag.
    if (capsSet.size <= 1) continue

    findings.push({
      category: "rogue_ap",
      severity: "high",
      title: `Conflicting security on SSID "${ssid}"`,
      description: `${group.length} access points advertise "${ssid}" with different security settings. This is a classic evil-twin pattern used to harvest credentials, though it can also occur with a misconfigured mesh or extender.`,
      evidence: {
        ssid,
        accessPoints: group.map((ap) => ({ bssid: ap.bssid, capabilities: ap.capabilities ?? null, rssi: ap.rssi ?? null })),
      },
      sourceType: "wifi_scan",
      identifier: `rogue:${ssid}`,
    })
  }

  return findings
}

export interface UsagePoint {
  bucketStart: string
  rxBytes: number
  txBytes: number
}

/**
 * Statistical anomaly detection over the user's own history. Needs at least 12
 * buckets of history; below that there is no baseline and it returns nothing
 * rather than guessing.
 */
export function analyzeTrafficAnomalies(points: UsagePoint[]): Finding[] {
  if (points.length < 12) return []

  const findings: Finding[] = []
  const txValues = points.map((p) => p.txBytes)
  const { mean: txMean, stdDev: txStd } = meanAndStdDev(txValues)

  if (txStd > 0) {
    for (const point of points.slice(-6)) {
      const z = (point.txBytes - txMean) / txStd
      const hour = new Date(point.bucketStart).getHours()
      const offHours = hour >= 1 && hour <= 5

      // z > 3 is a genuine statistical outlier, not normal variation.
      if (z > 3 && point.txBytes > 50 * 1024 * 1024) {
        findings.push({
          category: "traffic_anomaly",
          severity: offHours ? "high" : "medium",
          title: `Unusual upload burst at ${new Date(point.bucketStart).toLocaleString()}`,
          description: `Outbound traffic in this hour was ${z.toFixed(1)} standard deviations above your typical rate.${
            offHours ? " It happened between 1am and 5am, when little activity is expected." : ""
          } Large unexplained uploads can indicate data exfiltration or a camera streaming off-site.`,
          evidence: {
            bucketStart: point.bucketStart,
            txBytes: point.txBytes,
            baselineMeanBytes: Math.round(txMean),
            zScore: Number(z.toFixed(2)),
          },
          sourceType: "analytics",
          identifier: `anomaly:tx:${point.bucketStart}`,
        })
      }
    }
  }

  return findings
}

export interface SpeedPoint {
  createdAt: string | Date
  downloadMbps: number
  latencyMs: number
  connectionType: string
}

/** Detects sustained throughput collapse or latency spikes versus baseline. */
export function analyzePerformanceAnomalies(tests: SpeedPoint[]): Finding[] {
  if (tests.length < 6) return []

  const findings: Finding[] = []
  const sorted = [...tests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const latest = sorted[0]
  const baseline = sorted.slice(1, 11)
  if (!latest || baseline.length < 5) return []

  const { mean: dlMean } = meanAndStdDev(baseline.map((t) => t.downloadMbps))
  const { mean: latMean, stdDev: latStd } = meanAndStdDev(baseline.map((t) => t.latencyMs))

  if (dlMean > 1 && latest.downloadMbps < dlMean * 0.4) {
    findings.push({
      category: "traffic_anomaly",
      severity: "medium",
      title: "Download throughput dropped sharply",
      description: `Your most recent test measured ${latest.downloadMbps.toFixed(1)} Mbps against a recent average of ${dlMean.toFixed(1)} Mbps — a drop of more than 60%. Check for congestion, an interfering device, or ISP throttling.`,
      evidence: {
        latestMbps: latest.downloadMbps,
        baselineMbps: Number(dlMean.toFixed(2)),
        connectionType: latest.connectionType,
        measuredAt: new Date(latest.createdAt).toISOString(),
      },
      sourceType: "analytics",
      identifier: `anomaly:dl:${new Date(latest.createdAt).toISOString()}`,
    })
  }

  if (latStd > 0 && (latest.latencyMs - latMean) / latStd > 3 && latest.latencyMs > 80) {
    findings.push({
      category: "traffic_anomaly",
      severity: "low",
      title: "Latency spike detected",
      description: `Latency of ${latest.latencyMs.toFixed(0)} ms is well above your typical ${latMean.toFixed(0)} ms. This usually means link congestion or buffer bloat.`,
      evidence: {
        latestMs: latest.latencyMs,
        baselineMs: Number(latMean.toFixed(1)),
        measuredAt: new Date(latest.createdAt).toISOString(),
      },
      sourceType: "analytics",
      identifier: `anomaly:lat:${new Date(latest.createdAt).toISOString()}`,
    })
  }

  return findings
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

/** Classifies a device from its ports and vendor, for the device list. */
export function inferDeviceType(host: { mac?: string | null; openPorts?: number[]; hostname?: string | null }) {
  const ports = host.openPorts ?? []
  if (host.mac && isCameraVendor(host.mac)) return "camera"
  if (ports.some((p) => p in CAMERA_PORT_SIGNATURES)) return "camera"
  if (ports.includes(9100) || ports.includes(631)) return "printer"
  if (ports.includes(53) || ports.includes(1900)) return "router"
  if (ports.includes(445) || ports.includes(3389)) return "computer"
  const host_ = (host.hostname ?? "").toLowerCase()
  if (host_.includes("iphone") || host_.includes("android") || host_.includes("pixel")) return "phone"
  if (host_.includes("tv") || host_.includes("roku") || host_.includes("chromecast")) return "tv"
  return "unknown"
}

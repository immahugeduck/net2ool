/** Truncates a date to the top of its hour — the bucket granularity for usage. */
export function hourBucket(date: Date) {
  const d = new Date(date)
  d.setMinutes(0, 0, 0)
  return d
}

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]

export function formatBytes(bytes: number, decimals = 1) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), UNITS.length - 1)
  const scaled = value / Math.pow(1024, i)
  return `${scaled.toFixed(i === 0 ? 0 : decimals)} ${UNITS[i]}`
}

export function formatMbps(mbps: number) {
  const value = Number(mbps)
  if (!Number.isFinite(value) || value <= 0) return "0.00"
  if (value >= 1000) return value.toFixed(0)
  if (value >= 100) return value.toFixed(1)
  return value.toFixed(2)
}

export function formatMs(ms: number) {
  const value = Number(ms)
  if (!Number.isFinite(value)) return "—"
  return value >= 100 ? value.toFixed(0) : value.toFixed(1)
}

/**
 * Population standard deviation and mean, used for the z-score anomaly checks
 * in the threat analyzer.
 */
export function meanAndStdDev(values: number[]) {
  if (!values.length) return { mean: 0, stdDev: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return { mean, stdDev: Math.sqrt(variance) }
}

export function connectionLabel(type: string) {
  switch (type) {
    case "wifi":
      return "Wi-Fi"
    case "cellular":
      return "Cellular"
    case "ethernet":
      return "Ethernet"
    default:
      return "Unknown"
  }
}

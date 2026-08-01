export function formatBytes(bytes: number | string | null | undefined, decimals = 1): string {
  const n = typeof bytes === "string" ? Number(bytes) : (bytes ?? 0)
  if (!Number.isFinite(n) || n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const value = n / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`
}

export function formatMbps(mbps: number | null | undefined): string {
  const n = Number(mbps ?? 0)
  if (!Number.isFinite(n)) return "0.00"
  if (n >= 1000) return n.toFixed(0)
  if (n >= 100) return n.toFixed(1)
  return n.toFixed(2)
}

export function formatMs(ms: number | null | undefined): string {
  const n = Number(ms ?? 0)
  if (!Number.isFinite(n)) return "0"
  return n >= 100 ? n.toFixed(0) : n.toFixed(1)
}

export function formatPercent(fraction: number | null | undefined): string {
  const n = Number(fraction ?? 0)
  if (!Number.isFinite(n)) return "0%"
  return `${(n * 100).toFixed(n > 0 && n < 0.01 ? 2 : 0)}%`
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export const CONNECTION_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  cellular: "Cellular",
  ethernet: "Ethernet",
  unknown: "Unknown",
}

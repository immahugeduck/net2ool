/**
 * net2ool measurement engine.
 *
 * Design notes that matter for accuracy:
 *  - Multiple parallel streams are required to saturate a modern link. A single
 *    TCP connection is limited by BDP and will under-report on fast/high-latency
 *    connections.
 *  - The first `RAMP_DISCARD_MS` of each phase is excluded from the final
 *    average because TCP slow-start has not converged yet. Including it makes
 *    fast links look slow.
 *  - Upload uses XMLHttpRequest, not fetch, because `xhr.upload.onprogress` is
 *    the only reliable way to observe outbound bytes in a browser.
 *  - Throughput is reported in megabits per second (1 Mbit = 1_000_000 bits),
 *    matching how ISPs advertise speed.
 */

export type Phase = "idle" | "latency" | "download" | "upload" | "saving" | "done" | "error"

export type ConnectionType = "wifi" | "cellular" | "ethernet" | "unknown"

export interface LatencyResult {
  latencyMs: number
  jitterMs: number
  packetLoss: number
  samples: number[]
}

export interface ThroughputResult {
  mbps: number
  bytes: number
  seconds: number
  samples: number[]
}

export interface SpeedTestResult {
  latency: LatencyResult
  download: ThroughputResult
  upload: ThroughputResult
  connectionType: ConnectionType
  effectiveType: string | null
  publicIp: string | null
  serverRegion: string | null
  asn: string | null
}

export interface EngineOptions {
  downloadSeconds: number
  uploadSeconds: number
  parallelStreams: number
  onPhase?: (phase: Phase) => void
  /** Live instantaneous throughput in Mbps, plus 0..1 progress for the phase. */
  onProgress?: (mbps: number, progress: number) => void
  onLatency?: (result: LatencyResult) => void
  signal?: AbortSignal
}

const RAMP_DISCARD_MS = 2500
const SAMPLE_INTERVAL_MS = 250
const PING_COUNT = 12
const PING_TIMEOUT_MS = 4000

const bitsPerByte = 8
const bitsPerMegabit = 1_000_000

function toMbps(bytes: number, ms: number) {
  if (ms <= 0) return 0
  return (bytes * bitsPerByte) / (ms / 1000) / bitsPerMegabit
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Mean absolute successive difference — the standard jitter definition. */
function jitterOf(values: number[]) {
  if (values.length < 2) return 0
  let sum = 0
  for (let i = 1; i < values.length; i++) sum += Math.abs(values[i] - values[i - 1])
  return sum / (values.length - 1)
}

interface NetworkInformationLike {
  type?: string
  effectiveType?: string
}

export function detectConnection(): { connectionType: ConnectionType; effectiveType: string | null } {
  if (typeof navigator === "undefined") {
    return { connectionType: "unknown", effectiveType: null }
  }
  const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  const rawType = conn?.type
  const effectiveType = conn?.effectiveType ?? null

  let connectionType: ConnectionType = "unknown"
  if (rawType === "wifi") connectionType = "wifi"
  else if (rawType === "cellular") connectionType = "cellular"
  else if (rawType === "ethernet") connectionType = "ethernet"

  return { connectionType, effectiveType }
}

function randomBlob(bytes: number) {
  const buf = new Uint8Array(bytes)
  for (let offset = 0; offset < bytes; offset += 65536) {
    crypto.getRandomValues(buf.subarray(offset, Math.min(offset + 65536, bytes)))
  }
  return new Blob([buf], { type: "application/octet-stream" })
}

async function measureLatency(signal?: AbortSignal): Promise<LatencyResult> {
  const samples: number[] = []
  let lost = 0

  for (let i = 0; i < PING_COUNT; i++) {
    if (signal?.aborted) break
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
    const started = performance.now()
    try {
      const res = await fetch(`/api/speedtest/ping?n=${i}&t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!res.ok && res.status !== 204) throw new Error("bad status")
      samples.push(performance.now() - started)
    } catch {
      lost += 1
    } finally {
      clearTimeout(timer)
    }
  }

  // Drop the first sample: it carries DNS/TLS/connection setup cost.
  const steady = samples.length > 1 ? samples.slice(1) : samples

  return {
    latencyMs: median(steady),
    jitterMs: jitterOf(steady),
    packetLoss: PING_COUNT ? lost / PING_COUNT : 0,
    samples,
  }
}

/**
 * Shared sampling loop. Reports instantaneous throughput every
 * SAMPLE_INTERVAL_MS and returns the steady-state average.
 */
function createMeter(durationMs: number, onProgress?: EngineOptions["onProgress"]) {
  let totalBytes = 0
  let lastBytes = 0
  let lastAt = performance.now()
  const startedAt = lastAt
  let rampBytes: number | null = null
  let rampAt: number | null = null
  const samples: number[] = []

  const interval = setInterval(() => {
    const now = performance.now()
    const deltaBytes = totalBytes - lastBytes
    const deltaMs = now - lastAt
    const instant = toMbps(deltaBytes, deltaMs)
    samples.push(Number(instant.toFixed(3)))
    lastBytes = totalBytes
    lastAt = now

    const elapsed = now - startedAt
    if (rampBytes === null && elapsed >= RAMP_DISCARD_MS) {
      rampBytes = totalBytes
      rampAt = now
    }
    onProgress?.(instant, Math.min(elapsed / durationMs, 1))
  }, SAMPLE_INTERVAL_MS)

  return {
    add(bytes: number) {
      totalBytes += bytes
    },
    finish(): ThroughputResult {
      clearInterval(interval)
      const now = performance.now()
      const elapsed = now - startedAt

      // Prefer the steady-state window; fall back to the whole run for tests
      // shorter than the ramp-discard window.
      const useRamp = rampBytes !== null && rampAt !== null && now - rampAt > 500
      const bytes = useRamp ? totalBytes - (rampBytes as number) : totalBytes
      const ms = useRamp ? now - (rampAt as number) : elapsed

      return {
        mbps: Number(toMbps(bytes, ms).toFixed(2)),
        bytes: totalBytes,
        seconds: Number((elapsed / 1000).toFixed(1)),
        samples,
      }
    },
  }
}

async function measureDownload(
  durationMs: number,
  streams: number,
  onProgress?: EngineOptions["onProgress"],
  signal?: AbortSignal,
): Promise<ThroughputResult> {
  const meter = createMeter(durationMs, onProgress)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener("abort", abort)

  const deadline = performance.now() + durationMs
  const stopTimer = setTimeout(abort, durationMs)

  // Request far more than we expect to consume; we abort on the deadline.
  const perRequestBytes = 128 * 1024 * 1024

  const worker = async (index: number) => {
    while (performance.now() < deadline && !controller.signal.aborted) {
      try {
        const res = await fetch(`/api/speedtest/download?bytes=${perRequestBytes}&s=${index}&t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const body = res.body
        if (!body) break
        const reader = body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          meter.add(value?.byteLength ?? 0)
          if (performance.now() >= deadline || controller.signal.aborted) {
            await reader.cancel().catch(() => {})
            break
          }
        }
      } catch {
        if (controller.signal.aborted) break
        // Transient failure — brief backoff, then retry within the budget.
        await new Promise((r) => setTimeout(r, 120))
      }
    }
  }

  await Promise.all(Array.from({ length: streams }, (_, i) => worker(i)))
  clearTimeout(stopTimer)
  signal?.removeEventListener("abort", abort)
  return meter.finish()
}

function uploadOnce(blob: Blob, onBytes: (delta: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `/api/speedtest/upload?t=${Date.now()}`, true)
    xhr.setRequestHeader("Content-Type", "application/octet-stream")

    let lastLoaded = 0
    xhr.upload.onprogress = (event) => {
      const delta = event.loaded - lastLoaded
      lastLoaded = event.loaded
      if (delta > 0) onBytes(delta)
    }
    xhr.onload = () => resolve()
    xhr.onerror = () => reject(new Error("upload failed"))
    xhr.onabort = () => resolve()

    const onAbort = () => xhr.abort()
    signal.addEventListener("abort", onAbort, { once: true })
    xhr.onloadend = () => signal.removeEventListener("abort", onAbort)

    xhr.send(blob)
  })
}

async function measureUpload(
  durationMs: number,
  streams: number,
  onProgress?: EngineOptions["onProgress"],
  signal?: AbortSignal,
): Promise<ThroughputResult> {
  const meter = createMeter(durationMs, onProgress)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener("abort", abort)

  const deadline = performance.now() + durationMs
  const stopTimer = setTimeout(abort, durationMs)

  // Reuse one payload per stream to avoid burning CPU on RNG mid-test.
  const payload = randomBlob(4 * 1024 * 1024)

  const worker = async () => {
    while (performance.now() < deadline && !controller.signal.aborted) {
      try {
        await uploadOnce(payload, (delta) => meter.add(delta), controller.signal)
      } catch {
        if (controller.signal.aborted) break
        await new Promise((r) => setTimeout(r, 120))
      }
    }
  }

  await Promise.all(Array.from({ length: streams }, () => worker()))
  clearTimeout(stopTimer)
  signal?.removeEventListener("abort", abort)
  return meter.finish()
}

async function fetchMeta() {
  try {
    const res = await fetch(`/api/speedtest/meta?t=${Date.now()}`, { cache: "no-store" })
    if (!res.ok) return { publicIp: null, serverRegion: null, asn: null }
    const data = (await res.json()) as { publicIp?: string; serverRegion?: string; asn?: string }
    return {
      publicIp: data.publicIp ?? null,
      serverRegion: data.serverRegion ?? null,
      asn: data.asn ?? null,
    }
  } catch {
    return { publicIp: null, serverRegion: null, asn: null }
  }
}

export async function runSpeedTest(options: EngineOptions): Promise<SpeedTestResult> {
  const { downloadSeconds, uploadSeconds, parallelStreams, onPhase, onProgress, onLatency, signal } = options

  onPhase?.("latency")
  const [latency, meta] = await Promise.all([measureLatency(signal), fetchMeta()])
  onLatency?.(latency)

  onPhase?.("download")
  const download = await measureDownload(downloadSeconds * 1000, parallelStreams, onProgress, signal)

  // Let queued buffers drain so the upload phase starts from a quiet link.
  await new Promise((r) => setTimeout(r, 800))

  onPhase?.("upload")
  const upload = await measureUpload(uploadSeconds * 1000, Math.max(2, Math.floor(parallelStreams / 2)), onProgress, signal)

  const { connectionType, effectiveType } = detectConnection()

  return {
    latency,
    download,
    upload,
    connectionType,
    effectiveType,
    publicIp: meta.publicIp,
    serverRegion: meta.serverRegion,
    asn: meta.asn,
  }
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Play, Square, Wifi, Signal, Cable, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SpeedGauge } from "@/components/speed-gauge"
import { detectConnection, runSpeedTest, type ConnectionType, type Phase, type SpeedTestResult } from "@/lib/speedtest/engine"
import { saveSpeedTest } from "@/app/actions/speedtest"
import { formatBytes, formatMbps, formatMs, formatPercent } from "@/lib/format"

const TYPE_ICON: Record<ConnectionType, typeof Wifi> = {
  wifi: Wifi,
  cellular: Signal,
  ethernet: Cable,
  unknown: HelpCircle,
}

export function SpeedTestPanel({
  downloadSeconds,
  uploadSeconds,
  parallelStreams,
}: {
  downloadSeconds: number
  uploadSeconds: number
  parallelStreams: number
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("idle")
  const [liveMbps, setLiveMbps] = useState(0)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<SpeedTestResult | null>(null)
  const [downMbps, setDownMbps] = useState<number | null>(null)
  const [latency, setLatency] = useState<{ latencyMs: number; jitterMs: number; packetLoss: number } | null>(null)
  const [connType, setConnType] = useState<ConnectionType>("unknown")
  const [autoDetected, setAutoDetected] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const { connectionType } = detectConnection()
    if (connectionType !== "unknown") {
      setConnType(connectionType)
      setAutoDetected(true)
    }
  }, [])

  const running = phase === "latency" || phase === "download" || phase === "upload" || phase === "saving"

  const start = useCallback(async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setResult(null)
    setDownMbps(null)
    setLatency(null)
    setLiveMbps(0)
    setProgress(0)

    try {
      const res = await runSpeedTest({
        downloadSeconds,
        uploadSeconds,
        parallelStreams,
        signal: controller.signal,
        onPhase: (p) => {
          setPhase(p)
          setLiveMbps(0)
          setProgress(0)
        },
        onProgress: (mbps, pr) => {
          setLiveMbps(mbps)
          setProgress(pr)
        },
        onLatency: (l) => setLatency(l),
      })

      // Freeze the download figure on screen before the upload phase overwrites it.
      setDownMbps(res.download.mbps)
      setPhase("saving")

      await saveSpeedTest({
        connectionType: connType,
        downloadMbps: res.download.mbps,
        uploadMbps: res.upload.mbps,
        latencyMs: res.latency.latencyMs,
        jitterMs: res.latency.jitterMs,
        packetLoss: res.latency.packetLoss,
        downloadBytes: res.download.bytes,
        uploadBytes: res.upload.bytes,
        downloadSeconds: res.download.seconds,
        uploadSeconds: res.upload.seconds,
        downloadSamples: res.download.samples,
        uploadSamples: res.upload.samples,
        publicIp: res.publicIp,
        serverRegion: res.serverRegion,
        asn: res.asn,
        effectiveType: res.effectiveType,
      })

      setResult(res)
      setLiveMbps(res.download.mbps)
      setPhase("done")
      toast.success("Test saved to your log")
      router.refresh()
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase("idle")
        return
      }
      console.log("[v0] speed test failed:", err)
      setPhase("error")
      toast.error("Test failed. Check your connection and try again.")
    }
  }, [connType, downloadSeconds, uploadSeconds, parallelStreams, router])

  function stop() {
    abortRef.current?.abort()
    setPhase("idle")
    setLiveMbps(0)
    setProgress(0)
  }

  const TypeIcon = TYPE_ICON[connType]
  const totalSeconds = downloadSeconds + uploadSeconds

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col items-center gap-1 px-5 pt-6">
        <SpeedGauge mbps={liveMbps} phase={phase} progress={progress} />
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
        <Metric
          icon={<ArrowDown className="size-3.5 text-primary" aria-hidden="true" />}
          label="Download"
          value={downMbps !== null ? formatMbps(downMbps) : result ? formatMbps(result.download.mbps) : "—"}
          unit="Mbps"
        />
        <Metric
          icon={<ArrowUp className="size-3.5 text-chart-2" aria-hidden="true" />}
          label="Upload"
          value={result ? formatMbps(result.upload.mbps) : "—"}
          unit="Mbps"
        />
      </div>

      <div className="grid grid-cols-3 gap-px bg-border">
        <Metric label="Latency" value={latency ? formatMs(latency.latencyMs) : "—"} unit="ms" compact />
        <Metric label="Jitter" value={latency ? formatMs(latency.jitterMs) : "—"} unit="ms" compact />
        <Metric label="Loss" value={latency ? formatPercent(latency.packetLoss) : "—"} unit="" compact />
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="conn-type" className="text-xs text-muted-foreground">
            Tag this run as
          </Label>
          <div className="flex items-center gap-2">
            <Select value={connType} onValueChange={(v) => setConnType(v as ConnectionType)} disabled={running}>
              <SelectTrigger id="conn-type" className="flex-1">
                <span className="flex items-center gap-2">
                  <TypeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wifi">Wi-Fi</SelectItem>
                <SelectItem value="cellular">Cellular</SelectItem>
                <SelectItem value="ethernet">Ethernet</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            {autoDetected && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                auto
              </Badge>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
            A device routes traffic over one interface at a time, so Wi-Fi and cellular cannot be measured at the same
            instant. Run one, switch your connection, run the other — net2ool pairs them automatically.
          </p>
        </div>

        {running ? (
          <Button onClick={stop} variant="destructive" size="lg" className="w-full">
            <Square className="size-4" aria-hidden="true" />
            Stop test
          </Button>
        ) : (
          <Button onClick={start} size="lg" className="w-full">
            <Play className="size-4" aria-hidden="true" />
            {result ? "Run again" : `Start test`}
            <span className="ml-1 font-mono text-xs opacity-70">~{totalSeconds}s</span>
          </Button>
        )}

        {result && (
          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border pt-4 text-xs">
            <Meta label="Data used" value={formatBytes(result.download.bytes + result.upload.bytes)} />
            {result.publicIp && <Meta label="IP" value={result.publicIp} />}
            {result.serverRegion && <Meta label="Edge" value={result.serverRegion} />}
            {result.asn && <Meta label="ASN" value={result.asn} />}
          </dl>
        )}
      </div>
    </Card>
  )
}

function Metric({
  icon,
  label,
  value,
  unit,
  compact,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  unit: string
  compact?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-card px-3 py-3">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={compact ? "font-mono text-base tabular-nums" : "font-mono text-xl font-semibold tabular-nums"}>
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  )
}

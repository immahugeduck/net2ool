"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Download, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { deleteTest } from "@/app/actions/speedtest"
import { CONNECTION_LABELS, formatBytes, formatDateTime, formatMbps, formatMs, formatPercent } from "@/lib/format"

export interface TestRow {
  id: number
  connectionType: string
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  packetLoss: number
  downloadBytes: string | number
  uploadBytes: string | number
  publicIp: string | null
  ispName: string | null
  serverRegion: string | null
  asn: string | null
  createdAt: Date
}

const CSV_COLUMNS = [
  "timestamp",
  "connection",
  "download_mbps",
  "upload_mbps",
  "latency_ms",
  "jitter_ms",
  "packet_loss",
  "download_bytes",
  "upload_bytes",
  "public_ip",
  "asn",
  "edge_region",
] as const

/** RFC 4180 quoting so commas and quotes in values can't break the file. */
function csvCell(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function HistoryList({ tests }: { tests: TestRow[] }) {
  function exportCsv() {
    const rows = tests.map((t) =>
      [
        new Date(t.createdAt).toISOString(),
        t.connectionType,
        t.downloadMbps,
        t.uploadMbps,
        t.latencyMs,
        t.jitterMs,
        t.packetLoss,
        t.downloadBytes,
        t.uploadBytes,
        t.publicIp,
        t.asn,
        t.serverRegion,
      ]
        .map(csvCell)
        .join(","),
    )

    const csv = [CSV_COLUMNS.join(","), ...rows].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `net2ool-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("CSV exported")
  }

  if (tests.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-medium">No tests yet</p>
          <p className="text-xs text-muted-foreground">Run your first speed test to start building the log.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" onClick={exportCsv} className="self-start">
        <Download className="size-4" aria-hidden="true" />
        Export CSV
      </Button>

      <div className="flex flex-col gap-2">
        {tests.map((test) => (
          <TestCard key={test.id} test={test} />
        ))}
      </div>
    </div>
  )
}

function TestCard({ test }: { test: TestRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function remove() {
    startTransition(async () => {
      await deleteTest(test.id)
      toast.success("Run deleted")
      router.refresh()
    })
  }

  return (
    <Card className="gap-0 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {CONNECTION_LABELS[test.connectionType] ?? test.connectionType}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatDateTime(test.createdAt)}</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="flex items-baseline gap-1.5">
              <ArrowDown className="size-3 text-primary" aria-hidden="true" />
              <span className="font-mono text-base font-semibold tabular-nums">{formatMbps(test.downloadMbps)}</span>
              <span className="text-[10px] text-muted-foreground">Mbps</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <ArrowUp className="size-3 text-chart-2" aria-hidden="true" />
              <span className="font-mono text-base font-semibold tabular-nums">{formatMbps(test.uploadMbps)}</span>
              <span className="text-[10px] text-muted-foreground">Mbps</span>
            </span>
          </div>

          <dl className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <Pair label="lat" value={`${formatMs(test.latencyMs)}ms`} />
            <Pair label="jit" value={`${formatMs(test.jitterMs)}ms`} />
            <Pair label="loss" value={formatPercent(test.packetLoss)} />
            <Pair label="data" value={formatBytes(Number(test.downloadBytes) + Number(test.uploadBytes))} />
          </dl>
        </div>

        <Button size="icon-sm" variant="ghost" onClick={remove} disabled={pending} aria-label="Delete this run">
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  )
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex gap-1">
      <dt>{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </span>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Check, Loader2, RadarIcon, ShieldCheck, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { deleteThreat, runSelfAnalysis, updateThreatStatus } from "@/app/actions/threats"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface ThreatRow {
  id: number
  category: string
  severity: string
  title: string
  description: string | null
  evidence: unknown
  sourceType: string
  status: string
  lastSeen: Date
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-destructive/50 bg-destructive/10 text-destructive",
  high: "border-destructive/40 bg-destructive/5 text-destructive",
  medium: "border-chart-2/50 bg-chart-2/10 text-chart-2",
  low: "border-border bg-secondary text-muted-foreground",
  info: "border-border bg-secondary text-muted-foreground",
}

export function ThreatPanel({ threats }: { threats: ThreatRow[] }) {
  const router = useRouter()
  const [scanning, startScan] = useTransition()

  function scan() {
    startScan(async () => {
      try {
        const res = await runSelfAnalysis()
        toast.success(
          res.found > 0
            ? `${res.found} finding${res.found === 1 ? "" : "s"} from ${res.analyzedTests} tests`
            : `No anomalies across ${res.analyzedTests} tests and ${res.analyzedUsageBuckets} hours of usage`,
        )
        router.refresh()
      } catch {
        toast.error("Analysis failed")
      }
    })
  }

  const open = threats.filter((t) => t.status === "open")

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analysis</CardTitle>
          <CardDescription className="text-pretty">
            Runs statistical checks on your own speed and usage history to flag throughput collapses, latency spikes,
            and off-hours upload bursts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={scan} disabled={scanning} className="w-full">
            {scanning ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RadarIcon className="size-4" aria-hidden="true" />
            )}
            {scanning ? "Analyzing…" : "Run analysis"}
          </Button>
        </CardContent>
      </Card>

      {threats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ShieldCheck className="size-8 text-chart-1" aria-hidden="true" />
            <p className="text-sm font-medium">No findings</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground text-pretty">
              Nothing has been detected. Camera, recorder, Bluetooth, and rogue access point detection requires the
              Android agent — a browser cannot scan radio or LAN interfaces.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="size-4 text-chart-2" aria-hidden="true" />
              {open.length} open finding{open.length === 1 ? "" : "s"}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {threats.map((threat) => (
              <ThreatCard key={threat.id} threat={threat} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ThreatCard({ threat }: { threat: ThreatRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)

  const resolved = threat.status !== "open"

  function setStatus(status: "open" | "acknowledged" | "resolved" | "ignored") {
    startTransition(async () => {
      await updateThreatStatus(threat.id, status)
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      await deleteThreat(threat.id)
      toast.success("Finding removed")
      router.refresh()
    })
  }

  const evidenceEntries =
    threat.evidence && typeof threat.evidence === "object" && !Array.isArray(threat.evidence)
      ? Object.entries(threat.evidence as Record<string, unknown>)
      : []

  return (
    <Card className={cn("gap-0 p-3", resolved && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("text-[10px] uppercase", SEVERITY_STYLES[threat.severity])}>
              {threat.severity}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {threat.category.replace(/_/g, " ")}
            </Badge>
            {resolved && (
              <Badge variant="outline" className="text-[10px]">
                {threat.status}
              </Badge>
            )}
          </div>

          <p className="text-sm font-medium text-pretty">{threat.title}</p>

          {threat.description && (
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">{threat.description}</p>
          )}

          {evidenceEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-[11px] text-primary underline-offset-4 hover:underline"
              aria-expanded={expanded}
            >
              {expanded ? "Hide evidence" : "Show evidence"}
            </button>
          )}

          {expanded && evidenceEntries.length > 0 && (
            <dl className="flex flex-col gap-1 rounded-md border border-border bg-secondary/40 p-2.5 font-mono text-[11px]">
              {evidenceEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="truncate text-right">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}

          <span className="text-[11px] text-muted-foreground">{formatRelativeTime(threat.lastSeen)}</span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!resolved && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setStatus("resolved")}
              disabled={pending}
              aria-label="Mark resolved"
            >
              <Check className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={remove}
            disabled={pending}
            aria-label="Delete finding"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

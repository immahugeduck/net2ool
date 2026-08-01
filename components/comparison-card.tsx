import { ArrowDown, ArrowUp, Signal, Wifi } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatMbps, formatMs, formatRelativeTime } from "@/lib/format"

interface Run {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  createdAt: Date
}

export function ComparisonCard({ wifi, cellular }: { wifi: Run | null; cellular: Run | null }) {
  if (!wifi && !cellular) return null

  const winner =
    wifi && cellular ? (wifi.downloadMbps >= cellular.downloadMbps ? "wifi" : "cellular") : null

  const delta =
    wifi && cellular
      ? Math.abs(wifi.downloadMbps - cellular.downloadMbps) /
        Math.max(Math.min(wifi.downloadMbps, cellular.downloadMbps), 0.01)
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wi-Fi vs Cellular</CardTitle>
        <CardDescription className="text-pretty">
          {wifi && cellular
            ? "Compared from your most recent run on each connection."
            : `Run a test on ${wifi ? "cellular" : "Wi-Fi"} to complete this comparison.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Side
            icon={<Wifi className="size-4" aria-hidden="true" />}
            name="Wi-Fi"
            run={wifi}
            isWinner={winner === "wifi"}
          />
          <Side
            icon={<Signal className="size-4" aria-hidden="true" />}
            name="Cellular"
            run={cellular}
            isWinner={winner === "cellular"}
          />
        </div>

        {winner && delta !== null && (
          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground text-pretty">
            <span className="font-medium text-foreground">
              {winner === "wifi" ? "Wi-Fi" : "Cellular"} is {delta >= 0.05 ? `${(delta * 100).toFixed(0)}% faster` : "roughly equal"}
            </span>{" "}
            on download. Runs were taken sequentially, not simultaneously.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Side({
  icon,
  name,
  run,
  isWinner,
}: {
  icon: React.ReactNode
  name: string
  run: Run | null
  isWinner: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="text-muted-foreground">{icon}</span>
          {name}
        </span>
        {isWinner && (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            Faster
          </Badge>
        )}
      </div>

      {run ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="flex items-baseline gap-1.5">
              <ArrowDown className="size-3 text-primary" aria-hidden="true" />
              <span className="font-mono text-lg font-semibold tabular-nums">{formatMbps(run.downloadMbps)}</span>
              <span className="text-[10px] text-muted-foreground">Mbps</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <ArrowUp className="size-3 text-chart-2" aria-hidden="true" />
              <span className="font-mono text-sm tabular-nums">{formatMbps(run.uploadMbps)}</span>
              <span className="text-[10px] text-muted-foreground">Mbps</span>
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{formatMs(run.latencyMs)} ms</span>
            <span>{formatRelativeTime(run.createdAt)}</span>
          </div>
        </>
      ) : (
        <p className="py-3 text-xs text-muted-foreground">No run recorded</p>
      )}
    </div>
  )
}

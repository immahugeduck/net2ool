import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { ArrowDown, ArrowUp } from "lucide-react"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { UsageCharts } from "@/components/usage-charts"
import { ManualUsageForm } from "@/components/manual-usage-form"
import { getDailyUsage, getHourlyUsage, getUsageBreakdown } from "@/app/actions/usage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CONNECTION_LABELS, formatBytes } from "@/lib/format"

export default async function UsagePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const [hourly, daily, breakdown] = await Promise.all([getHourlyUsage(24), getDailyUsage(14), getUsageBreakdown()])

  const total = breakdown.todayRx + breakdown.todayTx

  return (
    <AppShell userName={session.user.name}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Data usage</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            Upload and download volume tracked through the day, with trends over time.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Today total" value={formatBytes(total)} />
          <Stat
            label="Down"
            value={formatBytes(breakdown.todayRx)}
            icon={<ArrowDown className="size-3 text-chart-1" aria-hidden="true" />}
          />
          <Stat
            label="Up"
            value={formatBytes(breakdown.todayTx)}
            icon={<ArrowUp className="size-3 text-chart-2" aria-hidden="true" />}
          />
        </div>

        <UsageCharts hourly={hourly} daily={daily} />

        {breakdown.byType.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Today by connection</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {breakdown.byType.map((row) => (
                <div key={row.connectionType} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-sm">{CONNECTION_LABELS[row.connectionType] ?? row.connectionType}</span>
                  <span className="flex items-baseline gap-3 font-mono text-xs tabular-nums">
                    <span className="text-chart-1">{formatBytes(row.rxBytes)}</span>
                    <span className="text-chart-2">{formatBytes(row.txBytes)}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <ManualUsageForm />
      </div>
    </AppShell>
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card className="gap-0 p-3">
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="mt-1 font-mono text-base font-semibold tabular-nums">{value}</span>
    </Card>
  )
}

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { auth } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { SpeedTestPanel } from "@/components/speed-test-panel"
import { ComparisonCard } from "@/components/comparison-card"
import { getComparison, getRecentTests, getSettings } from "@/app/actions/speedtest"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CONNECTION_LABELS, formatMbps, formatRelativeTime } from "@/lib/format"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const [settings, comparison, recent] = await Promise.all([getSettings(), getComparison(), getRecentTests(5)])

  return (
    <AppShell userName={session.user.name}>
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Speed test</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            {settings.downloadSeconds}s download and {settings.uploadSeconds}s upload across {settings.parallelStreams}{" "}
            parallel streams. Every run is logged.
          </p>
        </div>

        <SpeedTestPanel
          downloadSeconds={settings.downloadSeconds}
          uploadSeconds={settings.uploadSeconds}
          parallelStreams={settings.parallelStreams}
        />

        <ComparisonCard wifi={comparison.wifi} cellular={comparison.cellular} />

        {recent.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Recent runs</CardTitle>
              <Link
                href="/history"
                className="flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
              >
                Full log
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {recent.map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {CONNECTION_LABELS[run.connectionType] ?? run.connectionType}
                    </Badge>
                    <span className="truncate text-xs text-muted-foreground">{formatRelativeTime(run.createdAt)}</span>
                  </span>
                  <span className="flex items-baseline gap-3 font-mono text-sm tabular-nums">
                    <span className="text-primary">{formatMbps(run.downloadMbps)}</span>
                    <span className="text-chart-2">{formatMbps(run.uploadMbps)}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

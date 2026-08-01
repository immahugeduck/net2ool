"use client"

import { useMemo, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatBytes } from "@/lib/format"
import type { DailyUsage, HourlyUsage } from "@/app/actions/usage"

const config = {
  rxBytes: { label: "Download", color: "var(--color-chart-1)" },
  txBytes: { label: "Upload", color: "var(--color-chart-2)" },
} satisfies ChartConfig

/** Chooses a single byte unit for the whole axis so ticks stay comparable. */
function axisFormatter(max: number) {
  const units: [number, string][] = [
    [1024 ** 3, "GB"],
    [1024 ** 2, "MB"],
    [1024, "KB"],
  ]
  const [divisor, unit] = units.find(([d]) => max >= d) ?? [1, "B"]
  return (value: number) => `${(value / divisor).toFixed(value / divisor >= 10 ? 0 : 1)}${unit}`
}

export function UsageCharts({ hourly, daily }: { hourly: HourlyUsage[]; daily: DailyUsage[] }) {
  const [view, setView] = useState<"hourly" | "daily">("hourly")

  const hourlyData = useMemo(
    () =>
      hourly.map((h) => ({
        ...h,
        label: new Date(h.bucketStart).toLocaleTimeString(undefined, { hour: "numeric" }),
      })),
    [hourly],
  )

  const dailyData = useMemo(
    () =>
      daily.map((d) => ({
        ...d,
        label: new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
      })),
    [daily],
  )

  const active = view === "hourly" ? hourlyData : dailyData
  const max = Math.max(...active.map((d) => Math.max(d.rxBytes, d.txBytes)), 1)
  const tickFmt = axisFormatter(max)
  const hasData = active.some((d) => d.rxBytes > 0 || d.txBytes > 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Usage trend</CardTitle>
            <CardDescription>{view === "hourly" ? "Last 24 hours by hour" : "Last 14 days by day"}</CardDescription>
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as "hourly" | "daily")}>
            <TabsList>
              <TabsTrigger value="hourly">24h</TabsTrigger>
              <TabsTrigger value="daily">14d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={config} className="h-[220px] w-full">
            {view === "hourly" ? (
              <AreaChart data={hourlyData} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={tickFmt} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatBytes(Number(v))} />} />
                <Area
                  dataKey="rxBytes"
                  type="monotone"
                  stroke="var(--color-chart-1)"
                  fill="var(--color-chart-1)"
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Area
                  dataKey="txBytes"
                  type="monotone"
                  stroke="var(--color-chart-2)"
                  fill="var(--color-chart-2)"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
              </AreaChart>
            ) : (
              <BarChart data={dailyData} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={tickFmt} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatBytes(Number(v))} />} />
                <Bar dataKey="rxBytes" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="txBytes" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ChartContainer>
        ) : (
          <div className="flex h-[220px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-center">
            <p className="text-sm font-medium">No usage recorded yet</p>
            <p className="max-w-xs px-4 text-xs leading-relaxed text-muted-foreground text-pretty">
              Run a speed test or add a manual entry. Install the Android agent for automatic device-wide tracking.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

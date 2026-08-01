"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { formatMbps } from "@/lib/format"
import type { Phase } from "@/lib/speedtest/engine"

/**
 * Gauge scale is logarithmic. A linear scale wastes almost the whole arc on
 * speeds nobody has: on a 0-1000 linear dial, a 50 Mbps line barely moves the
 * needle. Log scaling keeps 5, 50, and 500 Mbps all readable.
 */
const TICKS = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000]
const MAX = 1000
const START_ANGLE = 135
const SWEEP = 270

function valueToAngle(mbps: number) {
  const clamped = Math.max(0, Math.min(mbps, MAX))
  const fraction = Math.log10(clamped + 1) / Math.log10(MAX + 1)
  return START_ANGLE + fraction * SWEEP
}

/**
 * Coordinates are rounded to 3dp before they reach the DOM. Raw IEEE-754 floats
 * can stringify with different trailing digits during SSR than on the client,
 * which React reports as a hydration mismatch. Rounding makes the output
 * deterministic and is far below sub-pixel visibility.
 */
const round = (n: number) => Math.round(n * 1000) / 1000

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) }
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const start = polar(cx, cy, r, fromDeg)
  const end = polar(cx, cy, r, toDeg)
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

const PHASE_COPY: Record<Phase, string> = {
  idle: "Ready",
  latency: "Measuring latency",
  download: "Download",
  upload: "Upload",
  saving: "Saving results",
  done: "Complete",
  error: "Error",
}

export function SpeedGauge({
  mbps,
  phase,
  progress,
}: {
  mbps: number
  phase: Phase
  progress: number
}) {
  const size = 260
  const cx = size / 2
  const cy = size / 2
  const radius = 104

  const angle = valueToAngle(mbps)
  const isUpload = phase === "upload"
  const activeColor = isUpload ? "var(--color-chart-2)" : "var(--color-primary)"
  const running = phase === "download" || phase === "upload" || phase === "latency"

  const ticks = useMemo(
    () =>
      TICKS.map((t) => {
        const a = valueToAngle(t)
        const outer = polar(cx, cy, radius + 10, a)
        const inner = polar(cx, cy, radius + 2, a)
        const label = polar(cx, cy, radius + 22, a)
        return { t, outer, inner, label }
      }),
    [cx, cy, radius],
  )

  return (
    <div className="relative flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full max-h-[38svh] max-w-[260px] sm:max-h-none"
        role="img"
        aria-label={`${PHASE_COPY[phase]}: ${formatMbps(mbps)} megabits per second`}
      >
        {/* Track */}
        <path
          d={arcPath(cx, cy, radius, START_ANGLE, START_ANGLE + SWEEP)}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={10}
          strokeLinecap="round"
        />

        {/* Live value arc */}
        {mbps > 0 && (
          <path
            d={arcPath(cx, cy, radius, START_ANGLE, angle)}
            fill="none"
            stroke={activeColor}
            strokeWidth={10}
            strokeLinecap="round"
            className="transition-all duration-200 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${activeColor})` }}
          />
        )}

        {/* Phase progress ring (thin, inside) */}
        <path
          d={arcPath(cx, cy, radius - 16, START_ANGLE, START_ANGLE + SWEEP * Math.min(Math.max(progress, 0), 1))}
          fill="none"
          stroke="var(--color-muted-foreground)"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={running ? 0.7 : 0}
          className="transition-all duration-300"
        />

        {ticks.map(({ t, outer, inner, label }) => (
          <g key={t}>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--color-muted-foreground)" strokeWidth={1.5} opacity={0.5} />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground font-mono"
              style={{ fontSize: 8 }}
            >
              {t}
            </text>
          </g>
        ))}

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={polar(cx, cy, radius - 26, angle).x}
          y2={polar(cx, cy, radius - 26, angle).y}
          stroke={activeColor}
          strokeWidth={2}
          strokeLinecap="round"
          className="transition-all duration-200 ease-out"
          opacity={mbps > 0 ? 0.9 : 0.25}
        />
        <circle cx={cx} cy={cy} r={4} fill={activeColor} />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-[52%] flex flex-col items-center">
        <span
          className={cn(
            "font-mono text-4xl font-semibold tabular-nums tracking-tight transition-colors",
            isUpload ? "text-chart-2" : "text-foreground",
          )}
        >
          {formatMbps(mbps)}
        </span>
        <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Mbps</span>
        <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {running && (
            <span
              className="inline-block size-1.5 animate-pulse rounded-full"
              style={{ backgroundColor: activeColor }}
              aria-hidden="true"
            />
          )}
          {PHASE_COPY[phase]}
        </span>
      </div>
    </div>
  )
}

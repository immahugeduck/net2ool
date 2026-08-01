"use server"

import { and, asc, eq, gte, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { usageSample } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { hourBucket } from "@/lib/usage"

export interface HourlyUsage {
  bucketStart: string
  rxBytes: number
  txBytes: number
}

export interface DailyUsage {
  day: string
  rxBytes: number
  txBytes: number
}

/** Hour-by-hour totals for the last `hours` window (default: today so far). */
export async function getHourlyUsage(hours = 24): Promise<HourlyUsage[]> {
  const userId = await getUserId()
  const since = hourBucket(new Date(Date.now() - hours * 3600 * 1000))

  const rows = await db
    .select({
      bucketStart: usageSample.bucketStart,
      rxBytes: sql<number>`sum(${usageSample.rxBytes})::bigint`,
      txBytes: sql<number>`sum(${usageSample.txBytes})::bigint`,
    })
    .from(usageSample)
    .where(and(eq(usageSample.userId, userId), gte(usageSample.bucketStart, since)))
    .groupBy(usageSample.bucketStart)
    .orderBy(asc(usageSample.bucketStart))

  // Fill gaps so the chart shows a continuous timeline rather than skipping
  // hours with no recorded traffic.
  const byKey = new Map(rows.map((r) => [new Date(r.bucketStart).getTime(), r]))
  const out: HourlyUsage[] = []
  for (let i = hours - 1; i >= 0; i--) {
    const bucket = hourBucket(new Date(Date.now() - i * 3600 * 1000))
    const hit = byKey.get(bucket.getTime())
    out.push({
      bucketStart: bucket.toISOString(),
      rxBytes: Number(hit?.rxBytes ?? 0),
      txBytes: Number(hit?.txBytes ?? 0),
    })
  }
  return out
}

/** Day-by-day totals, for the multi-day trend view. */
export async function getDailyUsage(days = 14): Promise<DailyUsage[]> {
  const userId = await getUserId()
  const since = new Date(Date.now() - days * 86400 * 1000)
  since.setHours(0, 0, 0, 0)

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${usageSample.bucketStart}), 'YYYY-MM-DD')`,
      rxBytes: sql<number>`sum(${usageSample.rxBytes})::bigint`,
      txBytes: sql<number>`sum(${usageSample.txBytes})::bigint`,
    })
    .from(usageSample)
    .where(and(eq(usageSample.userId, userId), gte(usageSample.bucketStart, since)))
    .groupBy(sql`date_trunc('day', ${usageSample.bucketStart})`)
    .orderBy(sql`date_trunc('day', ${usageSample.bucketStart}) asc`)

  const byDay = new Map(rows.map((r) => [r.day, r]))
  const out: DailyUsage[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const hit = byDay.get(key)
    out.push({ day: key, rxBytes: Number(hit?.rxBytes ?? 0), txBytes: Number(hit?.txBytes ?? 0) })
  }
  return out
}

export async function getUsageBreakdown() {
  const userId = await getUserId()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [today] = await db
    .select({
      rxBytes: sql<number>`coalesce(sum(${usageSample.rxBytes}), 0)::bigint`,
      txBytes: sql<number>`coalesce(sum(${usageSample.txBytes}), 0)::bigint`,
    })
    .from(usageSample)
    .where(and(eq(usageSample.userId, userId), gte(usageSample.bucketStart, startOfDay)))

  const byType = await db
    .select({
      connectionType: usageSample.connectionType,
      rxBytes: sql<number>`coalesce(sum(${usageSample.rxBytes}), 0)::bigint`,
      txBytes: sql<number>`coalesce(sum(${usageSample.txBytes}), 0)::bigint`,
    })
    .from(usageSample)
    .where(and(eq(usageSample.userId, userId), gte(usageSample.bucketStart, startOfDay)))
    .groupBy(usageSample.connectionType)

  const bySource = await db
    .select({
      source: usageSample.source,
      rxBytes: sql<number>`coalesce(sum(${usageSample.rxBytes}), 0)::bigint`,
      txBytes: sql<number>`coalesce(sum(${usageSample.txBytes}), 0)::bigint`,
    })
    .from(usageSample)
    .where(and(eq(usageSample.userId, userId), gte(usageSample.bucketStart, startOfDay)))
    .groupBy(usageSample.source)

  return {
    todayRx: Number(today?.rxBytes ?? 0),
    todayTx: Number(today?.txBytes ?? 0),
    byType: byType.map((r) => ({ ...r, rxBytes: Number(r.rxBytes), txBytes: Number(r.txBytes) })),
    bySource: bySource.map((r) => ({ ...r, rxBytes: Number(r.rxBytes), txBytes: Number(r.txBytes) })),
  }
}

/**
 * Manual entry, for reading figures off a carrier bill or router page when the
 * Android agent is not installed.
 */
export async function addManualUsage(input: {
  rxMb: number
  txMb: number
  connectionType: string
  when?: string
}) {
  const userId = await getUserId()

  const rx = Math.max(0, Math.min(Number(input.rxMb) || 0, 1e7)) * 1024 * 1024
  const tx = Math.max(0, Math.min(Number(input.txMb) || 0, 1e7)) * 1024 * 1024
  const type = ["wifi", "cellular", "ethernet"].includes(input.connectionType) ? input.connectionType : "unknown"
  const when = input.when ? new Date(input.when) : new Date()
  if (Number.isNaN(when.getTime())) throw new Error("Invalid date")

  await db
    .insert(usageSample)
    .values({
      userId,
      bucketStart: hourBucket(when),
      rxBytes: Math.round(rx),
      txBytes: Math.round(tx),
      connectionType: type,
      source: "manual",
    })
    .onConflictDoUpdate({
      target: [usageSample.userId, usageSample.bucketStart, usageSample.connectionType, usageSample.source],
      set: {
        rxBytes: sql`${usageSample.rxBytes} + ${Math.round(rx)}`,
        txBytes: sql`${usageSample.txBytes} + ${Math.round(tx)}`,
        updatedAt: new Date(),
      },
    })

  revalidatePath("/usage")
}

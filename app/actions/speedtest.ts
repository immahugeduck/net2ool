"use server"

import { and, desc, eq, gte, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { speedTest, usageSample, userSetting } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { hourBucket } from "@/lib/usage"

export interface SaveSpeedTestInput {
  connectionType: string
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  packetLoss: number
  downloadBytes: number
  uploadBytes: number
  downloadSeconds: number
  uploadSeconds: number
  downloadSamples: number[]
  uploadSamples: number[]
  publicIp: string | null
  serverRegion: string | null
  asn: string | null
  effectiveType: string | null
  label?: string | null
}

const VALID_TYPES = new Set(["wifi", "cellular", "ethernet", "unknown"])

function clampNumber(value: unknown, max: number) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, max)
}

/**
 * Persists a completed run. The bytes the test moved are also folded into the
 * usage ledger, since that traffic genuinely crossed the user's connection.
 */
export async function saveSpeedTest(input: SaveSpeedTestInput) {
  const userId = await getUserId()

  const connectionType = VALID_TYPES.has(input.connectionType) ? input.connectionType : "unknown"

  // Group a WiFi run with the most recent Cellular run (or vice versa) taken
  // within the last 30 minutes, so the A/B comparison card can pair them.
  let comparisonGroup: string | null = null
  if (connectionType === "wifi" || connectionType === "cellular") {
    const counterpart = connectionType === "wifi" ? "cellular" : "wifi"
    const [recent] = await db
      .select({ group: speedTest.comparisonGroup, id: speedTest.id })
      .from(speedTest)
      .where(
        and(
          eq(speedTest.userId, userId),
          eq(speedTest.connectionType, counterpart),
          gte(speedTest.createdAt, new Date(Date.now() - 30 * 60 * 1000)),
        ),
      )
      .orderBy(desc(speedTest.createdAt))
      .limit(1)

    comparisonGroup = recent?.group ?? crypto.randomUUID()

    if (recent && !recent.group) {
      await db
        .update(speedTest)
        .set({ comparisonGroup })
        .where(and(eq(speedTest.id, recent.id), eq(speedTest.userId, userId)))
    }
  }

  const downloadBytes = clampNumber(input.downloadBytes, 1024 ** 4)
  const uploadBytes = clampNumber(input.uploadBytes, 1024 ** 4)

  const [row] = await db
    .insert(speedTest)
    .values({
      userId,
      connectionType,
      downloadMbps: clampNumber(input.downloadMbps, 1_000_000),
      uploadMbps: clampNumber(input.uploadMbps, 1_000_000),
      latencyMs: clampNumber(input.latencyMs, 600_000),
      jitterMs: clampNumber(input.jitterMs, 600_000),
      packetLoss: Math.min(clampNumber(input.packetLoss, 1), 1),
      downloadBytes,
      uploadBytes,
      downloadSeconds: Math.round(clampNumber(input.downloadSeconds, 3600)),
      uploadSeconds: Math.round(clampNumber(input.uploadSeconds, 3600)),
      downloadSamples: Array.isArray(input.downloadSamples) ? input.downloadSamples.slice(0, 600) : [],
      uploadSamples: Array.isArray(input.uploadSamples) ? input.uploadSamples.slice(0, 600) : [],
      publicIp: input.publicIp ?? null,
      serverRegion: input.serverRegion ?? null,
      asn: input.asn ?? null,
      effectiveType: input.effectiveType ?? null,
      label: input.label ?? null,
      comparisonGroup,
    })
    .returning({ id: speedTest.id })

  // Fold the test's own traffic into today's usage ledger.
  if (downloadBytes > 0 || uploadBytes > 0) {
    await db
      .insert(usageSample)
      .values({
        userId,
        bucketStart: hourBucket(new Date()),
        rxBytes: downloadBytes,
        txBytes: uploadBytes,
        connectionType,
        source: "app",
      })
      .onConflictDoUpdate({
        target: [usageSample.userId, usageSample.bucketStart, usageSample.connectionType, usageSample.source],
        set: {
          rxBytes: sql`${usageSample.rxBytes} + ${downloadBytes}`,
          txBytes: sql`${usageSample.txBytes} + ${uploadBytes}`,
          updatedAt: new Date(),
        },
      })
  }

  revalidatePath("/")
  revalidatePath("/history")
  revalidatePath("/usage")
  return { id: row.id, comparisonGroup }
}

export async function getRecentTests(limit = 25) {
  const userId = await getUserId()
  return db
    .select()
    .from(speedTest)
    .where(eq(speedTest.userId, userId))
    .orderBy(desc(speedTest.createdAt))
    .limit(Math.min(limit, 200))
}

/** Latest run per connection type, used by the WiFi vs Cellular card. */
export async function getComparison() {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(speedTest)
    .where(eq(speedTest.userId, userId))
    .orderBy(desc(speedTest.createdAt))
    .limit(60)

  const wifi = rows.find((r) => r.connectionType === "wifi") ?? null
  const cellular = rows.find((r) => r.connectionType === "cellular") ?? null
  return { wifi, cellular }
}

export async function deleteTest(id: number) {
  const userId = await getUserId()
  await db.delete(speedTest).where(and(eq(speedTest.id, id), eq(speedTest.userId, userId)))
  revalidatePath("/history")
  revalidatePath("/")
}

export async function getSettings() {
  const userId = await getUserId()
  const [row] = await db.select().from(userSetting).where(eq(userSetting.userId, userId)).limit(1)
  return (
    row ?? {
      userId,
      downloadSeconds: 45,
      uploadSeconds: 45,
      parallelStreams: 6,
      dataCapGb: null,
      updatedAt: new Date(),
    }
  )
}

export async function saveSettings(input: {
  downloadSeconds: number
  uploadSeconds: number
  parallelStreams: number
  dataCapGb: number | null
}) {
  const userId = await getUserId()

  const values = {
    downloadSeconds: Math.max(5, Math.min(Math.round(input.downloadSeconds), 120)),
    uploadSeconds: Math.max(5, Math.min(Math.round(input.uploadSeconds), 120)),
    parallelStreams: Math.max(1, Math.min(Math.round(input.parallelStreams), 16)),
    dataCapGb:
      input.dataCapGb === null || !Number.isFinite(input.dataCapGb) ? null : Math.max(0, Math.min(input.dataCapGb, 1e6)),
    updatedAt: new Date(),
  }

  await db
    .insert(userSetting)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userSetting.userId, set: values })

  revalidatePath("/settings")
  revalidatePath("/")
  return values
}

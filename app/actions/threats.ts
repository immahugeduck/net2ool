"use server"

import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { speedTest, threatFinding } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { SEVERITY_ORDER, analyzePerformanceAnomalies, analyzeTrafficAnomalies, type Finding } from "@/lib/threats"
import { getHourlyUsage } from "@/app/actions/usage"

export async function getThreats() {
  const userId = await getUserId()
  const rows = await db
    .select()
    .from(threatFinding)
    .where(eq(threatFinding.userId, userId))
    .orderBy(desc(threatFinding.lastSeen))

  return rows.sort((a, b) => {
    const openDiff = Number(a.status !== "open") - Number(b.status !== "open")
    if (openDiff !== 0) return openDiff
    const sevA = SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] ?? 9
    const sevB = SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] ?? 9
    if (sevA !== sevB) return sevA - sevB
    return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  })
}

/** Upserts findings on their stable identifier so rescans update in place. */
export async function persistFindings(userId: string, findings: Finding[]) {
  for (const finding of findings) {
    await db
      .insert(threatFinding)
      .values({
        userId,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        evidence: finding.evidence,
        sourceType: finding.sourceType,
        identifier: finding.identifier,
      })
      .onConflictDoUpdate({
        target: [threatFinding.userId, threatFinding.identifier],
        set: {
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
          evidence: finding.evidence,
          lastSeen: new Date(),
        },
      })
  }
}

/**
 * Runs the checks that can be computed server-side from data the user already
 * has: statistical anomalies in their own usage and speed history. Device,
 * Bluetooth, and Wi-Fi findings can only come from the Android agent.
 */
export async function runSelfAnalysis() {
  const userId = await getUserId()

  const [usage, tests] = await Promise.all([
    getHourlyUsage(72),
    db
      .select({
        createdAt: speedTest.createdAt,
        downloadMbps: speedTest.downloadMbps,
        latencyMs: speedTest.latencyMs,
        connectionType: speedTest.connectionType,
      })
      .from(speedTest)
      .where(eq(speedTest.userId, userId))
      .orderBy(desc(speedTest.createdAt))
      .limit(30),
  ])

  const findings = [...analyzeTrafficAnomalies(usage), ...analyzePerformanceAnomalies(tests)]
  await persistFindings(userId, findings)

  revalidatePath("/threats")
  return { found: findings.length, analyzedUsageBuckets: usage.length, analyzedTests: tests.length }
}

export async function updateThreatStatus(id: number, status: "open" | "acknowledged" | "resolved" | "ignored") {
  const userId = await getUserId()
  await db
    .update(threatFinding)
    .set({ status })
    .where(and(eq(threatFinding.id, id), eq(threatFinding.userId, userId)))
  revalidatePath("/threats")
}

export async function deleteThreat(id: number) {
  const userId = await getUserId()
  await db.delete(threatFinding).where(and(eq(threatFinding.id, id), eq(threatFinding.userId, userId)))
  revalidatePath("/threats")
}

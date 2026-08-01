import type { NextRequest } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { agentKey, networkDevice, usageSample } from "@/lib/db/schema"
import { hashAgentKey } from "@/lib/agent-key"
import { normalizeMac, vendorFromMac } from "@/lib/oui"
import { hourBucket } from "@/lib/usage"
import {
  analyzeBleDevices,
  analyzeLanHosts,
  analyzeWifiAps,
  inferDeviceType,
  type BleDevice,
  type LanHost,
  type WifiAp,
} from "@/lib/threats"
import { persistFindings } from "@/app/actions/threats"

export const dynamic = "force-dynamic"

interface IngestBody {
  lanHosts?: LanHost[]
  bleDevices?: BleDevice[]
  wifiAps?: WifiAp[]
  usage?: Array<{
    bucketStart?: string
    rxBytes?: number
    txBytes?: number
    connectionType?: string
  }>
}

const MAX_ITEMS = 512

/** Resolves a Bearer token to a user id, or null if invalid/revoked. */
async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization") ?? ""
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null
  if (!token) return null

  const hash = hashAgentKey(token)
  const [row] = await db
    .select({ id: agentKey.id, userId: agentKey.userId, revoked: agentKey.revoked })
    .from(agentKey)
    .where(eq(agentKey.keyHash, hash))
    .limit(1)

  if (!row || row.revoked) return null

  await db.update(agentKey).set({ lastUsedAt: new Date() }).where(eq(agentKey.id, row.id))
  return row.userId
}

export async function POST(request: NextRequest) {
  const userId = await authenticate(request)
  if (!userId) {
    return Response.json({ error: "Invalid or revoked agent key" }, { status: 401 })
  }

  let body: IngestBody
  try {
    body = (await request.json()) as IngestBody
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 })
  }

  const lanHosts = (body.lanHosts ?? []).slice(0, MAX_ITEMS)
  const bleDevices = (body.bleDevices ?? []).slice(0, MAX_ITEMS)
  const wifiAps = (body.wifiAps ?? []).slice(0, MAX_ITEMS)
  const usageRows = (body.usage ?? []).slice(0, MAX_ITEMS)

  let devicesUpserted = 0

  // 1. Reconcile the device inventory. A user-assigned customName is never
  //    overwritten by a scan.
  for (const host of lanHosts) {
    const mac = host.mac ? normalizeMac(host.mac) : null
    // Without a MAC there is no stable identity, so fall back to the IP.
    const identity = mac ?? (host.ip ? `ip:${host.ip}` : null)
    if (!identity) continue

    const ports = Array.isArray(host.openPorts) ? host.openPorts.filter((p) => Number.isInteger(p)).slice(0, 64) : []

    await db
      .insert(networkDevice)
      .values({
        userId,
        macAddress: identity,
        ipAddress: host.ip ?? null,
        hostname: host.hostname ?? null,
        vendor: (mac ? vendorFromMac(mac) : null) ?? host.vendor ?? null,
        deviceType: inferDeviceType({ mac, openPorts: ports, hostname: host.hostname }),
        openPorts: ports,
        isOnline: true,
        source: "agent",
      })
      .onConflictDoUpdate({
        target: [networkDevice.userId, networkDevice.macAddress],
        set: {
          ipAddress: host.ip ?? null,
          hostname: host.hostname ?? null,
          openPorts: ports,
          deviceType: inferDeviceType({ mac, openPorts: ports, hostname: host.hostname }),
          isOnline: true,
          source: "agent",
          lastSeen: new Date(),
        },
      })
    devicesUpserted++
  }

  // 2. Mark devices not seen in this sweep as offline, but only when the sweep
  //    actually returned hosts (an empty sweep usually means the scan failed).
  if (lanHosts.length > 0) {
    const seen = lanHosts
      .map((h) => (h.mac ? normalizeMac(h.mac) : h.ip ? `ip:${h.ip}` : null))
      .filter((v): v is string => Boolean(v))

    await db
      .update(networkDevice)
      .set({ isOnline: false })
      .where(
        and(
          eq(networkDevice.userId, userId),
          eq(networkDevice.source, "agent"),
          sql`${networkDevice.macAddress} <> ALL(${seen})`,
        ),
      )
  }

  // 3. Fold in OS-reported usage counters.
  let usageUpserted = 0
  for (const row of usageRows) {
    const when = row.bucketStart ? new Date(row.bucketStart) : new Date()
    if (Number.isNaN(when.getTime())) continue
    const rx = Math.max(0, Math.round(Number(row.rxBytes) || 0))
    const tx = Math.max(0, Math.round(Number(row.txBytes) || 0))
    if (rx === 0 && tx === 0) continue

    const type = ["wifi", "cellular", "ethernet"].includes(row.connectionType ?? "")
      ? (row.connectionType as string)
      : "unknown"

    // The agent reports absolute totals per bucket, so overwrite rather than
    // accumulate — this keeps retries idempotent.
    await db
      .insert(usageSample)
      .values({
        userId,
        bucketStart: hourBucket(when),
        rxBytes: rx,
        txBytes: tx,
        connectionType: type,
        source: "agent",
      })
      .onConflictDoUpdate({
        target: [usageSample.userId, usageSample.bucketStart, usageSample.connectionType, usageSample.source],
        set: { rxBytes: rx, txBytes: tx, updatedAt: new Date() },
      })
    usageUpserted++
  }

  // 4. Analyze and persist findings.
  const findings = [...analyzeLanHosts(lanHosts), ...analyzeBleDevices(bleDevices), ...analyzeWifiAps(wifiAps)]
  await persistFindings(userId, findings)

  return Response.json({
    ok: true,
    received: {
      lanHosts: lanHosts.length,
      bleDevices: bleDevices.length,
      wifiAps: wifiAps.length,
      usageBuckets: usageRows.length,
    },
    devicesUpserted,
    usageUpserted,
    findings: findings.length,
  })
}

/** Lets the agent verify its key before running a full scan. */
export async function GET(request: NextRequest) {
  const userId = await authenticate(request)
  if (!userId) return Response.json({ error: "Invalid or revoked agent key" }, { status: 401 })
  return Response.json({ ok: true, authenticated: true })
}

"use server"

import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { pairingSession, speedTest } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"

/** Seconds a session stays joinable / alive before it is considered expired. */
const SESSION_TTL_SEC = 15 * 60
/** Lead time between the host pressing start and both devices beginning. */
const COUNTDOWN_MS = 5000
/** Unambiguous code charset — no 0/O/1/I/L to avoid mis-typed joins. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

export type PairRole = "wifi" | "cellular"
export type PairParty = "host" | "guest"

export interface PairStateRun {
  connectionType: string
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  packetLoss: number
  createdAt: Date
}

export interface PairState {
  code: string
  status: string
  hostRole: PairRole
  guestRole: PairRole | null
  guestJoined: boolean
  hostDone: boolean
  guestDone: boolean
  comparisonGroup: string
  /** Milliseconds until the synchronized start, or null if not scheduled. */
  startInMs: number | null
  expired: boolean
  hostRun: PairStateRun | null
  guestRun: PairStateRun | null
}

function opposite(role: PairRole): PairRole {
  return role === "wifi" ? "cellular" : "wifi"
}

function makeCode() {
  let out = ""
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

async function loadRuns(hostResultId: number | null, guestResultId: number | null, userId: string) {
  const ids = [hostResultId, guestResultId].filter((n): n is number => typeof n === "number")
  if (ids.length === 0) return { host: null, guest: null }
  const rows = await db
    .select()
    .from(speedTest)
    .where(and(eq(speedTest.userId, userId), inArray(speedTest.id, ids)))
  const pick = (id: number | null): PairStateRun | null => {
    if (id === null) return null
    const r = rows.find((row) => row.id === id)
    if (!r) return null
    return {
      connectionType: r.connectionType,
      downloadMbps: r.downloadMbps,
      uploadMbps: r.uploadMbps,
      latencyMs: r.latencyMs,
      jitterMs: r.jitterMs,
      packetLoss: r.packetLoss,
      createdAt: r.createdAt,
    }
  }
  return { host: pick(hostResultId), guest: pick(guestResultId) }
}

/** Host creates a session and receives a join code. */
export async function createPairingSession(hostRole: PairRole): Promise<PairState> {
  const userId = await getUserId()
  const now = Date.now()
  const expiresAt = new Date(now + SESSION_TTL_SEC * 1000)
  const comparisonGroup = crypto.randomUUID()

  // Retry a few times on the extremely unlikely active-code collision.
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode()
    try {
      await db.insert(pairingSession).values({
        userId,
        code,
        status: "waiting",
        hostRole,
        comparisonGroup,
        expiresAt,
      })
      return {
        code,
        status: "waiting",
        hostRole,
        guestRole: null,
        guestJoined: false,
        hostDone: false,
        guestDone: false,
        comparisonGroup,
        startInMs: null,
        expired: false,
        hostRun: null,
        guestRun: null,
      }
    } catch (err) {
      lastErr = err
    }
  }
  throw new Error(`Could not create a pairing session: ${String(lastErr)}`)
}

/** Guest joins an existing waiting session by code. */
export async function joinPairingSession(rawCode: string): Promise<PairState> {
  const userId = await getUserId()
  const code = rawCode.trim().toUpperCase()
  if (code.length !== 6) throw new Error("Enter the 6-character code from the first device.")

  const [row] = await db
    .select()
    .from(pairingSession)
    .where(and(eq(pairingSession.userId, userId), eq(pairingSession.code, code)))
    .limit(1)

  if (!row) throw new Error("No session found for that code on this account.")
  if (new Date(row.expiresAt).getTime() < Date.now()) throw new Error("That session has expired. Start a new one.")
  if (row.status === "complete") throw new Error("That session already finished.")

  const guestRole = opposite(row.hostRole as PairRole)
  await db
    .update(pairingSession)
    .set({ guestJoined: true, guestRole, status: "ready", updatedAt: new Date() })
    .where(and(eq(pairingSession.id, row.id), eq(pairingSession.userId, userId)))

  return getPairingState(code)
}

/** Host schedules the synchronized start once the guest has joined. */
export async function startPairingSession(rawCode: string): Promise<PairState> {
  const userId = await getUserId()
  const code = rawCode.trim().toUpperCase()

  const [row] = await db
    .select()
    .from(pairingSession)
    .where(and(eq(pairingSession.userId, userId), eq(pairingSession.code, code)))
    .limit(1)

  if (!row) throw new Error("Session not found.")
  if (!row.guestJoined) throw new Error("The second device has not joined yet.")

  const startAt = new Date(Date.now() + COUNTDOWN_MS)
  await db
    .update(pairingSession)
    .set({ status: "counting", startAt, updatedAt: new Date() })
    .where(and(eq(pairingSession.id, row.id), eq(pairingSession.userId, userId)))

  return getPairingState(code)
}

/** Either device reports its finished run; the last one flips status to complete. */
export async function submitPairingResult(
  rawCode: string,
  party: PairParty,
  resultId: number,
): Promise<PairState> {
  const userId = await getUserId()
  const code = rawCode.trim().toUpperCase()

  const [row] = await db
    .select()
    .from(pairingSession)
    .where(and(eq(pairingSession.userId, userId), eq(pairingSession.code, code)))
    .limit(1)
  if (!row) throw new Error("Session not found.")

  const hostDone = party === "host" ? true : row.hostDone
  const guestDone = party === "guest" ? true : row.guestDone
  const bothDone = hostDone && guestDone

  await db
    .update(pairingSession)
    .set({
      hostResultId: party === "host" ? resultId : row.hostResultId,
      guestResultId: party === "guest" ? resultId : row.guestResultId,
      hostDone,
      guestDone,
      status: bothDone ? "complete" : "running",
      updatedAt: new Date(),
    })
    .where(and(eq(pairingSession.id, row.id), eq(pairingSession.userId, userId)))

  return getPairingState(code)
}

/** Polled by both devices to observe shared state and the countdown. */
export async function getPairingState(rawCode: string): Promise<PairState> {
  const userId = await getUserId()
  const code = rawCode.trim().toUpperCase()

  const [row] = await db
    .select()
    .from(pairingSession)
    .where(and(eq(pairingSession.userId, userId), eq(pairingSession.code, code)))
    .limit(1)

  if (!row) throw new Error("Session not found.")

  const now = Date.now()
  const expired = new Date(row.expiresAt).getTime() < now && row.status !== "complete"

  // Once the scheduled instant passes, the shared status is "running".
  let status = row.status
  let startInMs: number | null = null
  if (row.startAt) {
    startInMs = new Date(row.startAt).getTime() - now
    if (startInMs <= 0 && (status === "counting" || status === "ready")) status = "running"
  }
  if (expired) status = "expired"

  const runs = await loadRuns(row.hostResultId, row.guestResultId, userId)

  return {
    code: row.code,
    status,
    hostRole: row.hostRole as PairRole,
    guestRole: (row.guestRole as PairRole | null) ?? null,
    guestJoined: row.guestJoined,
    hostDone: row.hostDone,
    guestDone: row.guestDone,
    comparisonGroup: row.comparisonGroup,
    startInMs,
    expired,
    hostRun: runs.host,
    guestRun: runs.guest,
  }
}

/** Host or guest tears the session down. */
export async function cancelPairingSession(rawCode: string): Promise<void> {
  const userId = await getUserId()
  const code = rawCode.trim().toUpperCase()
  await db
    .update(pairingSession)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(pairingSession.userId, userId), eq(pairingSession.code, code)))
}

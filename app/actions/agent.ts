"use server"

import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { agentKey } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { generateAgentKey } from "@/lib/agent-key"

export async function getAgentKeys() {
  const userId = await getUserId()
  return db
    .select({
      id: agentKey.id,
      name: agentKey.name,
      keyPrefix: agentKey.keyPrefix,
      lastUsedAt: agentKey.lastUsedAt,
      revoked: agentKey.revoked,
      createdAt: agentKey.createdAt,
    })
    .from(agentKey)
    .where(eq(agentKey.userId, userId))
    .orderBy(desc(agentKey.createdAt))
}

/** Returns the raw key exactly once — it is never recoverable afterwards. */
export async function createAgentKey(name: string) {
  const userId = await getUserId()
  const { raw, hash, prefix } = generateAgentKey()

  await db.insert(agentKey).values({
    userId,
    name: name.trim().slice(0, 60) || "Android Agent",
    keyHash: hash,
    keyPrefix: prefix,
  })

  revalidatePath("/settings")
  return { rawKey: raw }
}

export async function revokeAgentKey(id: number) {
  const userId = await getUserId()
  await db
    .update(agentKey)
    .set({ revoked: true })
    .where(and(eq(agentKey.id, id), eq(agentKey.userId, userId)))
  revalidatePath("/settings")
}

export async function deleteAgentKey(id: number) {
  const userId = await getUserId()
  await db.delete(agentKey).where(and(eq(agentKey.id, id), eq(agentKey.userId, userId)))
  revalidatePath("/settings")
}

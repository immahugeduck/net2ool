import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/**
 * There is no Row Level Security on Neon, so every query that touches user
 * data must be scoped with the id returned here.
 */
export async function getUserId() {
  const session = await getSession()
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

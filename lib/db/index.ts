import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { __net2oolPool?: Pool }

/**
 * Neon's connection string carries `sslmode=require`, which `pg` currently
 * treats as full verification but will downgrade to libpq semantics (no
 * certificate verification) in pg v9. Pinning `verify-full` keeps the strict
 * behaviour across that upgrade instead of silently weakening TLS.
 */
function connectionString() {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error("DATABASE_URL is not set")
  try {
    const url = new URL(raw)
    url.searchParams.set("sslmode", "verify-full")
    return url.toString()
  } catch {
    return raw
  }
}

export const pool =
  globalForDb.__net2oolPool ??
  new Pool({
    connectionString: connectionString(),
    max: 5,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.__net2oolPool = pool
}

export const db = drizzle(pool, { schema })

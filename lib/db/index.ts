import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as { __netscopePool?: Pool }

export const pool =
  globalForDb.__netscopePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.__netscopePool = pool
}

export const db = drizzle(pool, { schema })

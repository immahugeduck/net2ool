import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"

export const auth = betterAuth({
  database: pool,
  /**
   * Left undefined in sandbox/preview environments on purpose: Better Auth then
   * derives the base URL from the incoming request, which is the only correct
   * value when the hostname is assigned dynamically per sandbox.
   */
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.V0_RUNTIME_URL) ??
    undefined,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  /**
   * The v0 preview is served from a per-sandbox hostname (`sb-*.vercel.run`)
   * that is not knowable at build time, and Vercel preview deployments get a
   * fresh `*.vercel.app` host per commit. Better Auth accepts a function so the
   * origin can be validated per request instead of hardcoded.
   */
  trustedOrigins: (request?: Request) => {
    const origins = new Set<string>()

    if (process.env.V0_RUNTIME_URL) origins.add(process.env.V0_RUNTIME_URL)
    if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`)
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    }
    if (process.env.BETTER_AUTH_URL) origins.add(process.env.BETTER_AUTH_URL)

    // Better Auth invokes this without a request on some internal code paths
    // (session reads), so the request must be treated as optional.
    const candidate = request?.headers?.get("origin") ?? request?.headers?.get("referer")
    if (candidate) {
      try {
        const { protocol, hostname, origin } = new URL(candidate)
        const isLocal = hostname === "localhost" || hostname === "127.0.0.1"
        // v0 sandbox previews and Vercel preview deployments.
        const isTrustedPreview =
          protocol === "https:" && (hostname.endsWith(".vercel.run") || hostname.endsWith(".vercel.app"))
        if (isLocal || isTrustedPreview) origins.add(origin)
      } catch {
        // Malformed header — ignore it rather than trusting it.
      }
    }

    return [...origins]
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // The v0 preview renders the app in a cross-site iframe; without
          // these attributes the browser silently drops the session cookie.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})

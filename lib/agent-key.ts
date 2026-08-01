import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Agent API keys are stored only as HMAC-SHA256 digests, keyed by the server's
 * BETTER_AUTH_SECRET. A database leak therefore does not expose usable keys.
 * The raw key is shown to the user exactly once at creation.
 */
function pepper() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set; cannot hash agent keys")
  return secret
}

export function hashAgentKey(rawKey: string) {
  return createHmac("sha256", pepper()).update(rawKey).digest("hex")
}

export function generateAgentKey() {
  // 32 bytes of entropy, base64url so it survives HTTP headers unescaped.
  const raw = `nsk_${randomBytes(32).toString("base64url")}`
  return { raw, hash: hashAgentKey(raw), prefix: raw.slice(0, 12) }
}

export function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  } catch {
    return false
  }
}

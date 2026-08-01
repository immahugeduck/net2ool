import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Reports the observed client IP plus the Vercel edge region serving the
 * request. These come from real request headers — nothing is inferred.
 */
export async function GET(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  const publicIp = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null

  return Response.json(
    {
      publicIp,
      serverRegion: process.env.VERCEL_REGION ?? "local",
      // Vercel geo headers, present on deployed apps.
      city: request.headers.get("x-vercel-ip-city") ?? null,
      country: request.headers.get("x-vercel-ip-country") ?? null,
      asn: request.headers.get("x-vercel-ip-as-number") ?? null,
      timestamp: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

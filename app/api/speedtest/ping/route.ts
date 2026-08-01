export const dynamic = "force-dynamic"
export const revalidate = 0

/** Smallest possible response so the round trip measures latency, not transfer. */
export async function GET() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Server-Timing": `srv;dur=0`,
    },
  })
}

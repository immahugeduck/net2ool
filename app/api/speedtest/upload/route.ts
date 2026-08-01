import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Drains the uploaded body and reports how many bytes actually arrived.
 *
 * The client measures wall-clock time around the request; this endpoint only
 * needs to consume the stream as fast as possible so the network link, not
 * server-side buffering, is the bottleneck.
 */
export async function POST(request: NextRequest) {
  let received = 0

  const body = request.body
  if (body) {
    const reader = body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value?.byteLength ?? 0
      }
    } catch {
      // Client aborted mid-stream once its budget elapsed. Still report bytes.
    }
  }

  return Response.json(
    { received },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}

export async function OPTIONS() {
  return new Response(null, { status: 204 })
}

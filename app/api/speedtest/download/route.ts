import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

/** 256 KiB of incompressible random data, reused across chunks. */
const CHUNK_SIZE = 256 * 1024
const MAX_BYTES = 512 * 1024 * 1024

function makeChunk() {
  const buf = new Uint8Array(CHUNK_SIZE)
  // crypto.getRandomValues caps at 65536 bytes per call.
  for (let offset = 0; offset < CHUNK_SIZE; offset += 65536) {
    crypto.getRandomValues(buf.subarray(offset, Math.min(offset + 65536, CHUNK_SIZE)))
  }
  return buf
}

/**
 * Streams pseudo-random bytes for the download measurement.
 *
 * Random payload matters: gzip/brotli on a compressible payload would
 * inflate the measured throughput far above the real link capacity.
 */
export async function GET(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get("bytes") ?? 0)
  const totalBytes = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_BYTES) : 32 * 1024 * 1024

  const chunk = makeChunk()
  let sent = 0

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close()
        return
      }
      const remaining = totalBytes - sent
      const slice = remaining >= CHUNK_SIZE ? chunk : chunk.subarray(0, remaining)
      controller.enqueue(slice)
      sent += slice.byteLength
    },
    cancel() {
      // Client aborted because its time budget elapsed. Expected, not an error.
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(totalBytes),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Content-Encoding": "identity",
      Pragma: "no-cache",
    },
  })
}

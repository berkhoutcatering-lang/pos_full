import { NextResponse } from "next/server"

// Cheapest possible "are we online" endpoint. The cloud-side connection
// poller hits this every 15s; no auth, no DB, no rate-limit.
export const dynamic = "force-dynamic"
export const revalidate = 0

export function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    { headers: { "cache-control": "no-store" } },
  )
}

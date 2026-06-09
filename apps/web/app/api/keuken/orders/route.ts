import { NextResponse, type NextRequest } from "next/server"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listActiveOrders } from "@/lib/dal/active-orders"

// REST fallback used by the KDS when realtime drops. Same RLS-scoped data
// the page-load uses; venue cookie pins scope.

export async function GET(req: NextRequest) {
  await requireRole("cashier")
  const claims = await requireVenue()
  const url = new URL(req.url)
  const venueId = url.searchParams.get("venueId")
  if (venueId && venueId !== claims.venueId) {
    return NextResponse.json({ error: "venue_mismatch" }, { status: 403 })
  }
  const orders = await listActiveOrders({
    orgId: claims.orgId,
    venueId: claims.venueId,
  })
  return NextResponse.json(
    { orders },
    { headers: { "cache-control": "no-store" } },
  )
}

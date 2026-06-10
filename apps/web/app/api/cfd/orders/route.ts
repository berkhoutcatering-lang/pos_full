import { NextResponse } from "next/server"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listActiveOrders } from "@/lib/dal/active-orders"

// CFD polling-fallback: Supabase realtime werkt niet zonder internet,
// dus het klantenscherm polt deze route over LAN (de Pi serveert hem en
// overlayt de offline outbox). Viewer-rol volstaat; PII wordt gestript
// net als bij de page-load.

export async function GET() {
  await requireRole("viewer")
  const claims = await requireVenue()
  const orders = await listActiveOrders({
    orgId: claims.orgId,
    venueId: claims.venueId,
  })
  const stripped = orders.map((o) => ({
    id: o.id,
    ordered_label: o.ordered_label,
    customer_name: o.customer_name,
    status: o.status,
    placed_at: o.placed_at,
    prepared_at: o.prepared_at,
  }))
  return NextResponse.json(
    { orders: stripped },
    { headers: { "cache-control": "no-store" } },
  )
}

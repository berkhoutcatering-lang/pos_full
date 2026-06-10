import { NextResponse } from "next/server"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listOrderHistory } from "@/lib/dal/active-orders"

// Geschiedenis-paneel op de KDS: vandaag uitgegeven/geannuleerde bonnen.

export async function GET() {
  await requireRole("cashier")
  const claims = await requireVenue()
  const orders = await listOrderHistory({
    orgId: claims.orgId,
    venueId: claims.venueId,
  })
  return NextResponse.json(
    { orders },
    { headers: { "cache-control": "no-store" } },
  )
}

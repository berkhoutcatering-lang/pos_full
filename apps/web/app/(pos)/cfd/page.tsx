import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listActiveOrders } from "@/lib/dal/active-orders"
import { CfdShell } from "./components/cfd-shell"

export const dynamic = "force-dynamic"

export default async function CfdPage() {
  // 'viewer' minimum — a dedicated CFD account with no PII access works too.
  await requireRole("viewer")
  const claims = await requireVenue()
  const initial = await listActiveOrders({
    orgId: claims.orgId,
    venueId: claims.venueId,
  })
  // Strip PII before sending to the client display.
  const stripped = initial.map((o) => ({
    id: o.id,
    ordered_label: o.ordered_label,
    customer_name: o.customer_name,
    status: o.status,
    placed_at: o.placed_at,
    prepared_at: o.prepared_at,
  }))
  return (
    <CfdShell initial={stripped} orgId={claims.orgId} venueId={claims.venueId} />
  )
}

import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listActiveOrders } from "@/lib/dal/active-orders"
import { KdsShell } from "./components/kds-shell"

export const dynamic = "force-dynamic"

export default async function KeukenPage() {
  await requireRole("cashier")
  const claims = await requireVenue()
  const initial = await listActiveOrders({
    orgId: claims.orgId,
    venueId: claims.venueId,
  })
  return (
    <KdsShell
      initial={initial}
      orgId={claims.orgId}
      venueId={claims.venueId}
    />
  )
}

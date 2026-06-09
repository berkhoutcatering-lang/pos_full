import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listOperationalItems } from "@/lib/dal/operational-items"
import { AvailabilityView } from "./availability-view"

export const dynamic = "force-dynamic"

export default async function AvailabilityPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const items = await listOperationalItems({
    orgId: claims.orgId,
    venueId: claims.venueId,
  })
  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">Beschikbaarheid</h2>
      <p className="mb-3 text-sm opacity-70">
        Tik een item om het direct uit te schakelen op de kassa. Geel = manager-uit, rood = OP (geen voorraad).
      </p>
      <AvailabilityView initial={items} orgId={claims.orgId} venueId={claims.venueId} />
    </section>
  )
}

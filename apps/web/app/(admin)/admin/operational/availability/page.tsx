import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listOperationalItems } from "@/lib/dal/operational-items"
import { PageHead } from "@/components/admin/page-head"
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
      <PageHead
        eyebrow="Operationeel · werkt offline"
        title="Beschikbaarheid"
        sub="Zet items aan/uit. Wijzigingen verschijnen direct op de kassa — amber = manager-uit, rood = OP (geen voorraad)."
      />
      <AvailabilityView initial={items} orgId={claims.orgId} venueId={claims.venueId} />
    </section>
  )
}

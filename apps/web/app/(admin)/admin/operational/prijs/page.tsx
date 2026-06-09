import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listOperationalItems } from "@/lib/dal/operational-items"
import { PageHead } from "@/components/admin/page-head"
import { PrijsView } from "./prijs-view"

export const dynamic = "force-dynamic"

export default async function PrijsPage() {
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
        title="Prijs (tijdelijk)"
        sub="Stel tijdelijke prijzen in voor happy hour of acties. Verloopt automatisch — de basisprijs blijft staan."
      />
      <PrijsView initial={items} orgId={claims.orgId} venueId={claims.venueId} />
    </section>
  )
}

import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listOperationalItems } from "@/lib/dal/operational-items"
import { PageHead } from "@/components/admin/page-head"
import { VoorraadView } from "./voorraad-view"

export const dynamic = "force-dynamic"

export default async function VoorraadPage() {
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
        title="Voorraad"
        sub="Tel en corrigeer voorraad per item. Bij 0 verdwijnt het item automatisch van de kassa."
      />
      <VoorraadView initial={items} orgId={claims.orgId} venueId={claims.venueId} />
    </section>
  )
}

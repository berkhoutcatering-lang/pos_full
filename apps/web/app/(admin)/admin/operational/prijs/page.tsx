import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listOperationalItems } from "@/lib/dal/operational-items"
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
      <h2 className="mb-4 text-2xl font-bold">Tijdelijke prijswijziging</h2>
      <p className="mb-3 text-sm opacity-70">
        Voor rush-aanbieding of correctie. Vervalt automatisch op de gekozen
        tijd; standaard einde van vandaag. Permanente prijswijziging gaat via{" "}
        <a href="/admin/menu" className="underline">/admin/menu</a>.
      </p>
      <PrijsView initial={items} orgId={claims.orgId} venueId={claims.venueId} />
    </section>
  )
}

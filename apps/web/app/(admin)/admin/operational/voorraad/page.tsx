import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listOperationalItems } from "@/lib/dal/operational-items"
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
      <h2 className="mb-4 text-2xl font-bold">Voorraad</h2>
      <p className="mb-3 text-sm opacity-70">
        Tijdens een rush: tik snel +/− om de teller bij te werken. Werkt
        ook offline via de Pi-bridge.
      </p>
      <VoorraadView initial={items} orgId={claims.orgId} venueId={claims.venueId} />
    </section>
  )
}

import { requireRole, requireVenue } from "@/lib/dal/auth"
import { PageHead } from "@/components/admin/page-head"
import { DevicesView } from "./devices-view"

export const dynamic = "force-dynamic"

export default async function DevicesPage() {
  await requireRole("manager")
  await requireVenue()
  return (
    <section>
      <PageHead
        eyebrow="Operationeel · werkt offline"
        title="Apparaten"
        sub="Alle hardware op deze locatie. De Pi-bridge houdt de kassa draaiend, ook als het internet wegvalt."
      />
      <DevicesView />
    </section>
  )
}

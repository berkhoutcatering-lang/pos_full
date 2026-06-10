import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listMenuItemsAdmin } from "@/lib/dal/admin-menu"
import { PageHead } from "@/components/admin/page-head"
import { MenuEditor } from "./menu-editor"

export const dynamic = "force-dynamic"

export default async function AdminMenuPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  // Beheer toont ALLE actieve items (ook onbeschikbare/op) — readMenu is
  // de kassa-view en filtert die er juist uit.
  const items = await listMenuItemsAdmin({
    orgId: claims.orgId,
    venueId: claims.venueId,
  })

  return (
    <section>
      <PageHead
        eyebrow="Beheer"
        title="Menu"
        sub="Volledige menukaart met BTW-klasse per item. Snel aan/uit en voorraad doe je onder Operationeel."
      />
      <MenuEditor items={items} />
    </section>
  )
}

import { requireRole, requireVenue } from "@/lib/dal/auth"
import { listMenuItemsAdmin, listModifierGroupsAdmin } from "@/lib/dal/admin-menu"
import { PageHead } from "@/components/admin/page-head"
import { MenuEditor } from "./menu-editor"
import { ModifierGroupsEditor } from "./modifier-groups-editor"

export const dynamic = "force-dynamic"

export default async function AdminMenuPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  // Beheer toont ALLE actieve items (ook onbeschikbare/op) — readMenu is
  // de kassa-view en filtert die er juist uit.
  const [items, groups] = await Promise.all([
    listMenuItemsAdmin({ orgId: claims.orgId, venueId: claims.venueId }),
    listModifierGroupsAdmin({ orgId: claims.orgId, venueId: claims.venueId }),
  ])

  return (
    <section>
      <PageHead
        eyebrow="Beheer"
        title="Menu"
        sub="Volledige menukaart met BTW-klasse per item. Snel aan/uit en voorraad doe je onder Operationeel."
      />
      <div className="flex flex-col gap-7">
        <MenuEditor items={items} groups={groups} />
        <ModifierGroupsEditor groups={groups} />
      </div>
    </section>
  )
}

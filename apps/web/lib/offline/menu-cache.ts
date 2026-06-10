import "server-only"
import { offlineCacheRead, offlineCacheWrite } from "@/lib/offline/cache"
import type { AdminMenuItem } from "@/lib/dal/admin-menu"
import type { MenuSnapshot } from "@/lib/pos/types"

// Applies an offline menu mutation to the Pi's local last-good caches so
// the beheer-lijst en de kassa-SSR de wijziging direct tonen, zonder op
// de Supabase-sync te wachten. No-op buiten de Pi (cache dir unset).

export async function applyMenuMutationToLocalCaches(args: {
  orgId: string
  venueId: string
  item: AdminMenuItem
  remove: boolean
}): Promise<void> {
  const adminKey = `admin-menu-${args.orgId}-${args.venueId}`
  const adminList = (await offlineCacheRead<AdminMenuItem[]>(adminKey)) ?? []
  const nextAdmin = adminList.filter((i) => i.id !== args.item.id)
  if (!args.remove) nextAdmin.push(args.item)
  nextAdmin.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name),
  )
  await offlineCacheWrite(adminKey, nextAdmin)

  const menuKey = `menu-${args.orgId}-${args.venueId}`
  const snapshot = await offlineCacheRead<MenuSnapshot>(menuKey)
  if (snapshot) {
    const items = snapshot.items.filter((i) => i.id !== args.item.id)
    if (!args.remove) {
      items.push({
        id: args.item.id,
        name: args.item.name,
        category: args.item.category,
        base_price_cents: args.item.base_price_cents,
        btw_class: args.item.btw_class as MenuSnapshot["items"][number]["btw_class"],
        is_discountable: args.item.is_discountable,
        available_modifier_group_ids: [],
        image_url: null,
      })
    }
    await offlineCacheWrite(menuKey, { ...snapshot, items })
  }
}

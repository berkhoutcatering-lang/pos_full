import "server-only"
import { createClient } from "@/lib/supabase/server"
import { isNetworkError, offlineCacheRead, offlineCacheWrite } from "@/lib/offline/cache"

// Beheer-lijst: ALLE actieve items, ook wat op de kassa onzichtbaar is
// (voorraad 0, beschikbaarheid uit). readMenu filtert op is_available en
// is daarmee ongeschikt voor het beheerscherm.

export interface AdminMenuItem {
  id: string
  name: string
  category: string
  base_price_cents: number
  btw_class: string
  station: string
  is_discountable: boolean
  sort_order: number
}

export async function listMenuItemsAdmin(args: {
  orgId: string
  venueId: string
}): Promise<AdminMenuItem[]> {
  const cacheKey = `admin-menu-${args.orgId}-${args.venueId}`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_menu_items")
    .select("id, name, category, base_price_cents, btw_class, station, is_discountable, sort_order")
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .eq("is_active", true)
    .order("category")
    .order("sort_order")
    .order("name")
  if (error) {
    if (isNetworkError(error)) {
      return (await offlineCacheRead<AdminMenuItem[]>(cacheKey)) ?? []
    }
    throw error
  }
  const items = (data ?? []) as AdminMenuItem[]
  void offlineCacheWrite(cacheKey, items)
  return items
}

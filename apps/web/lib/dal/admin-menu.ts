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
  available_modifier_group_ids: string[]
}

export async function listMenuItemsAdmin(args: {
  orgId: string
  venueId: string
}): Promise<AdminMenuItem[]> {
  const cacheKey = `admin-menu-${args.orgId}-${args.venueId}`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_menu_items")
    .select(
      "id, name, category, base_price_cents, btw_class, station, is_discountable, sort_order, available_modifier_group_ids",
    )
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
  const items = ((data ?? []) as AdminMenuItem[]).map((i) => ({
    ...i,
    available_modifier_group_ids: i.available_modifier_group_ids ?? [],
  }))
  void offlineCacheWrite(cacheKey, items)
  return items
}

export interface AdminModifierGroup {
  id: string
  name: string
  min_select: number
  max_select: number
  options: Array<{ id: string; name: string; surcharge_cents: number }>
}

export async function listModifierGroupsAdmin(args: {
  orgId: string
  venueId: string
}): Promise<AdminModifierGroup[]> {
  const cacheKey = `admin-modgroups-${args.orgId}-${args.venueId}`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_modifier_groups")
    .select("id, name, min_select, max_select, options")
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .eq("is_active", true)
    .order("name")
  if (error) {
    if (isNetworkError(error)) {
      return (await offlineCacheRead<AdminModifierGroup[]>(cacheKey)) ?? []
    }
    throw error
  }
  const groups = ((data ?? []) as AdminModifierGroup[]).map((g) => ({
    ...g,
    options: g.options ?? [],
  }))
  void offlineCacheWrite(cacheKey, groups)
  return groups
}

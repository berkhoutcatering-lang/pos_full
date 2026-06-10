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

export interface AdminCombo {
  id: string
  name: string
  trigger_item_ids: string[]
  trigger_min_qty: Record<string, number>
  discount_cents: number
  active_from: string | null
  active_to: string | null
}

export async function listCombosAdmin(args: {
  orgId: string
  venueId: string
}): Promise<AdminCombo[]> {
  const cacheKey = `admin-combos-${args.orgId}-${args.venueId}`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_combos")
    .select("id, name, trigger_item_ids, trigger_min_qty, discount_cents, active_from, active_to")
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .eq("is_active", true)
    .order("name")
  if (error) {
    if (isNetworkError(error)) {
      return (await offlineCacheRead<AdminCombo[]>(cacheKey)) ?? []
    }
    throw error
  }
  const combos = ((data ?? []) as AdminCombo[]).map((c) => ({
    ...c,
    trigger_item_ids: c.trigger_item_ids ?? [],
    trigger_min_qty: c.trigger_min_qty ?? {},
  }))
  void offlineCacheWrite(cacheKey, combos)
  return combos
}

export interface AdminStaffel {
  id: string
  name: string
  applies_to_item_ids: string[]
  qty_threshold: number
  discount_per_extra_cents: number
}

export async function listStaffelsAdmin(args: {
  orgId: string
  venueId: string
}): Promise<AdminStaffel[]> {
  const cacheKey = `admin-staffels-${args.orgId}-${args.venueId}`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_staffels")
    .select("id, name, applies_to_item_ids, qty_threshold, discount_per_extra_cents")
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .eq("is_active", true)
    .order("name")
  if (error) {
    if (isNetworkError(error)) {
      return (await offlineCacheRead<AdminStaffel[]>(cacheKey)) ?? []
    }
    throw error
  }
  const staffels = ((data ?? []) as AdminStaffel[]).map((s) => ({
    ...s,
    applies_to_item_ids: s.applies_to_item_ids ?? [],
  }))
  void offlineCacheWrite(cacheKey, staffels)
  return staffels
}

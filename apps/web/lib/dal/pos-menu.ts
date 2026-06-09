import "server-only"
import { createClient } from "@/lib/supabase/server"
import type {
  ComboDef,
  MenuItem,
  MenuSnapshot,
  ModifierGroup,
  ModifierOption,
  StaffelDef,
} from "@/lib/pos/types"

// Server-side menu fetch. Authoritative source for the SSR shell — the Pi
// read-cache shadows this for offline. RLS scopes the read to the user's
// org; the explicit .eq("venue_id", ...) keeps the venue axis tight too.

export async function readMenu(orgId: string, venueId: string): Promise<MenuSnapshot> {
  const supabase = await createClient()

  const [itemsRes, modsRes, combosRes, staffelsRes] = await Promise.all([
    // Read from the effective view so price + availability already
    // reflect manager overrides + stock. /pos filters on is_available=true
    // so OP / manager-uit items disappear from the grid.
    supabase
      .from("pos_menu_items_effective")
      .select(
        "id, name, category, effective_price_cents, btw_class, is_discountable, available_modifier_group_ids, image_url, sort_order, is_available",
      )
      .eq("org_id", orgId)
      .eq("venue_id", venueId)
      .eq("is_available", true)
      .order("sort_order"),
    supabase
      .from("pos_modifier_groups")
      .select("id, name, min_select, max_select, options")
      .eq("org_id", orgId)
      .eq("venue_id", venueId)
      .eq("is_active", true),
    supabase
      .from("pos_combos")
      .select(
        "id, name, trigger_item_ids, trigger_min_qty, discount_cents, active_from, active_to, is_active",
      )
      .eq("org_id", orgId)
      .eq("venue_id", venueId)
      .eq("is_active", true),
    supabase
      .from("pos_staffels")
      .select(
        "id, name, applies_to_item_ids, qty_threshold, discount_per_extra_cents, is_active",
      )
      .eq("org_id", orgId)
      .eq("venue_id", venueId)
      .eq("is_active", true),
  ])

  const items: MenuItem[] = (itemsRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    category: r.category as string,
    // Use effective price (manager override if active, else base).
    base_price_cents: r.effective_price_cents as number,
    btw_class: r.btw_class as MenuItem["btw_class"],
    is_discountable: r.is_discountable as boolean,
    available_modifier_group_ids: (r.available_modifier_group_ids ?? []) as string[],
    image_url: (r.image_url ?? null) as string | null,
  }))

  const modifier_groups: ModifierGroup[] = (modsRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    min_select: r.min_select as number,
    max_select: r.max_select as number,
    options: (r.options ?? []) as ModifierOption[],
  }))

  const combos: ComboDef[] = (combosRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    trigger_item_ids: r.trigger_item_ids as string[],
    trigger_min_qty: (r.trigger_min_qty ?? {}) as Record<string, number>,
    discount_cents: r.discount_cents as number,
    active_from: r.active_from as string | null,
    active_to: r.active_to as string | null,
  }))

  const staffels: StaffelDef[] = (staffelsRes.data ?? []).map((r) => ({
    id: r.id as string,
    applies_to_item_ids: r.applies_to_item_ids as string[],
    qty_threshold: r.qty_threshold as number,
    discount_per_extra_cents: r.discount_per_extra_cents as number,
  }))

  return { items, modifier_groups, combos, staffels }
}

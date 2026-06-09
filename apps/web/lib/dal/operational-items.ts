import "server-only"
import { createClient } from "@/lib/supabase/server"

export interface OperationalItem {
  id: string
  name: string
  category: string
  base_price_cents: number
  effective_price_cents: number
  btw_class: string
  is_active: boolean
  stock_qty: number | null
  is_available_override: boolean | null
  is_available: boolean
  price_override_cents: number | null
  price_override_expires_at: string | null
  sort_order: number
}

export async function listOperationalItems(args: {
  orgId: string
  venueId: string
}): Promise<OperationalItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_menu_items_effective")
    .select(
      "id, name, category, base_price_cents, effective_price_cents, btw_class, stock_qty, is_available_override, is_available, sort_order",
    )
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .order("category")
    .order("sort_order")
  if (error) throw error
  // The view doesn't expose is_active / price_override_*; fetch separately.
  const { data: raw } = await supabase
    .from("pos_menu_items")
    .select("id, is_active, price_override_cents, price_override_expires_at")
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
  const rawMap = new Map(
    (raw ?? []).map((r) => [
      r.id as string,
      r as { is_active: boolean; price_override_cents: number | null; price_override_expires_at: string | null },
    ]),
  )
  return (data ?? []).map((d) => {
    const extra = rawMap.get(d.id as string)
    return {
      id: d.id as string,
      name: d.name as string,
      category: d.category as string,
      base_price_cents: d.base_price_cents as number,
      effective_price_cents: d.effective_price_cents as number,
      btw_class: d.btw_class as string,
      is_active: extra?.is_active ?? true,
      stock_qty: d.stock_qty as number | null,
      is_available_override: d.is_available_override as boolean | null,
      is_available: d.is_available as boolean,
      price_override_cents: extra?.price_override_cents ?? null,
      price_override_expires_at: extra?.price_override_expires_at ?? null,
      sort_order: d.sort_order as number,
    }
  })
}

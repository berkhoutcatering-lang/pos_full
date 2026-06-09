import "server-only"
import { createClient } from "@/lib/supabase/server"

export async function listVenueOrders(args: {
  orgId: string
  venueId: string
  statuses?: Array<"placed" | "preparing" | "ready" | "served" | "paid" | "voided" | "refunded">
  limit?: number
}) {
  const supabase = await createClient()
  let q = supabase
    .from("pos_orders")
    .select(
      "id, ordered_label, status, total_incl_cents, customer_name, placed_at, prepared_at, served_at",
    )
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .order("placed_at", { ascending: false })
    .limit(args.limit ?? 50)
  if (args.statuses?.length) q = q.in("status", args.statuses)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function getOrderWithItems(args: {
  orgId: string
  venueId: string
  orderId: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_orders")
    .select(
      `id, ordered_label, status, customer_name, customer_email, notes,
       subtotal_cents, discount_cents, total_excl_cents, total_btw_cents, total_incl_cents,
       placed_at, prepared_at, served_at, paid_at,
       items:pos_order_items (
         id, position, menu_item_id, name, category, qty,
         unit_price_cents, modifier_total_cents, discount_cents,
         btw_class, btw_rate, line_excl_cents, line_btw_cents, line_incl_cents,
         modifiers_json, notes
       )`,
    )
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .eq("id", args.orderId)
    .maybeSingle()
  if (error) throw error
  return data
}

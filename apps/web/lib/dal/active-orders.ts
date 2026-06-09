import "server-only"
import { createClient } from "@/lib/supabase/server"

export interface ActiveOrder {
  id: string
  ordered_label: string | null
  customer_name: string | null
  status: "placed" | "preparing" | "ready"
  placed_at: string
  prepared_at: string | null
  total_incl_cents: number
  items: Array<{
    id: string
    name: string
    qty: number
    station: string
    modifiers_json: unknown
    notes: string | null
  }>
}

export async function listActiveOrders(args: {
  orgId: string
  venueId: string
}): Promise<ActiveOrder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_orders")
    .select(
      `id, ordered_label, customer_name, status, placed_at, prepared_at, total_incl_cents,
       items:pos_order_items (id, name, qty, station, modifiers_json, notes)`,
    )
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .in("status", ["placed", "preparing", "ready"])
    .order("placed_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as ActiveOrder[]
}

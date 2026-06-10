import "server-only"
import { createClient } from "@/lib/supabase/server"
import { isNetworkError, offlineCacheRead, offlineCacheWrite } from "@/lib/offline/cache"
import { fetchPendingOutbox } from "@/lib/pi-bridge/server"
import type { MenuSnapshot } from "@/lib/pos/types"

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
  const cacheKey = `orders-${args.orgId}-${args.venueId}`
  let base: ActiveOrder[]
  let offline = false
  try {
    base = await listActiveOrdersOnline(args)
    void offlineCacheWrite(cacheKey, base)
  } catch (err) {
    if (!isNetworkError(err)) throw err
    // Pi without internet: last-good Supabase snapshot…
    offline = true
    base = (await offlineCacheRead<ActiveOrder[]>(cacheKey)) ?? []
  }
  if (!offline) return base
  // …overlaid with what's still queued in the Pi-bridge outbox, so orders
  // placed during the outage reach the KDS/CFD (not only the printer).
  return overlayPendingOutbox(base, args)
}

async function listActiveOrdersOnline(args: {
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

// ---- offline overlay -------------------------------------------------

interface PendingOrderPayload {
  order_id: string
  venue_id: string
  customer_label?: string | null
  items: Array<{
    id: string
    menu_item_id: string
    qty: number
    modifiers: Array<{ id: string; name: string; price_delta_cents: number }>
    note?: string | null
  }>
  totals: { incl_cents: number }
}

interface PendingStatePayload {
  order_id: string
  state: "preparing" | "ready" | "served" | "voided"
}

async function overlayPendingOutbox(
  base: ActiveOrder[],
  args: { orgId: string; venueId: string },
): Promise<ActiveOrder[]> {
  const pending = await fetchPendingOutbox()
  if (!pending || pending.length === 0) return base

  // Item names come from the cached menu — the kassa payload only carries
  // menu_item_id.
  const menu = await offlineCacheRead<MenuSnapshot>(`menu-${args.orgId}-${args.venueId}`)
  const nameById = new Map((menu?.items ?? []).map((i) => [i.id, i.name]))

  const byId = new Map(base.map((o) => [o.id, o]))

  for (const entry of pending) {
    if (entry.venue_id !== args.venueId) continue
    if (entry.table_name === "pos_orders") {
      const p = entry.payload as PendingOrderPayload
      if (byId.has(p.order_id)) continue // already flushed into the snapshot
      byId.set(p.order_id, {
        id: p.order_id,
        ordered_label: p.customer_label ?? `#${p.order_id.slice(0, 4).toUpperCase()}`,
        customer_name: p.customer_label ?? null,
        status: "placed",
        placed_at: new Date(entry.created_at).toISOString(),
        prepared_at: null,
        total_incl_cents: p.totals?.incl_cents ?? 0,
        items: (p.items ?? []).map((it) => ({
          id: it.id,
          name: nameById.get(it.menu_item_id) ?? "Item",
          qty: it.qty,
          station: "",
          modifiers_json: it.modifiers ?? [],
          notes: it.note ?? null,
        })),
      })
    }
  }

  // State changes queued offline win over whatever the snapshot says.
  for (const entry of pending) {
    if (entry.venue_id !== args.venueId) continue
    if (entry.table_name !== "pos_order_state_changes") continue
    const p = entry.payload as PendingStatePayload
    const order = byId.get(p.order_id)
    if (!order) continue
    if (p.state === "served" || p.state === "voided") {
      byId.delete(p.order_id)
    } else {
      byId.set(p.order_id, {
        ...order,
        status: p.state,
        prepared_at: p.state === "ready" ? new Date(entry.created_at).toISOString() : order.prepared_at,
      })
    }
  }

  return [...byId.values()].sort((a, b) => a.placed_at.localeCompare(b.placed_at))
}

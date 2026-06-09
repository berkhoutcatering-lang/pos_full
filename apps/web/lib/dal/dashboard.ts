import "server-only"
import { createClient } from "@/lib/supabase/server"

// Dashboard extras naast het Z-rapport: orders per uur + best verkocht.
// Zelfde dag-afbakening als computeZReport (Europe/Amsterdam).

export interface DashboardActivity {
  /** Orders per uur, index 0 = `startHour`. */
  orders_per_hour: number[]
  start_hour: number
  top_items: Array<{ name: string; qty: number; sum_cents: number }>
}

const START_HOUR = 11
const END_HOUR = 23

export async function computeDashboardActivity(args: {
  orgId: string
  venueId: string
  date: string // YYYY-MM-DD
}): Promise<DashboardActivity> {
  const supabase = await createClient()
  const start = `${args.date}T00:00:00+02:00`
  const end = `${args.date}T23:59:59.999+02:00`

  const { data: orders } = await supabase
    .from("pos_orders")
    .select(
      "id, status, placed_at, items:pos_order_items (name, qty, line_incl_cents)",
    )
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .gte("placed_at", start)
    .lte("placed_at", end)
    .in("status", ["paid", "refunded", "served", "ready", "preparing", "placed"])

  const hours = new Array<number>(END_HOUR - START_HOUR + 1).fill(0)
  const byItem = new Map<string, { qty: number; sum_cents: number }>()

  for (const o of (orders ?? []) as Array<{
    status: string
    placed_at: string
    items: Array<{ name: string; qty: number; line_incl_cents: number }>
  }>) {
    const hour = Number(
      new Intl.DateTimeFormat("nl-NL", {
        timeZone: "Europe/Amsterdam",
        hour: "2-digit",
        hour12: false,
      }).format(new Date(o.placed_at)),
    )
    const idx = hour - START_HOUR
    if (idx >= 0 && idx < hours.length) hours[idx] = (hours[idx] ?? 0) + 1

    for (const it of o.items ?? []) {
      const cur = byItem.get(it.name) ?? { qty: 0, sum_cents: 0 }
      cur.qty += it.qty
      cur.sum_cents += it.line_incl_cents
      byItem.set(it.name, cur)
    }
  }

  const top_items = Array.from(byItem.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.sum_cents - a.sum_cents)
    .slice(0, 5)

  return { orders_per_hour: hours, start_hour: START_HOUR, top_items }
}

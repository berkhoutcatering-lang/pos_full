import "server-only"
import { createClient } from "@/lib/supabase/server"
import type { BtwClass } from "@/lib/pos/types"

// Z-rapport (dagafsluiting) — sums line-level BTW from pos_order_items so
// the breakdown is exact even across mixed-rate carts. Cents only, no
// floats. Times are interpreted in Europe/Amsterdam.

export interface ZReport {
  date: string
  org_id: string
  venue_id: string
  order_count: number
  refund_count: number
  void_count: number
  btw_breakdown: Record<BtwClass, { excl_cents: number; btw_cents: number; incl_cents: number; rate: 0 | 9 | 21 }>
  total_excl_cents: number
  total_btw_cents: number
  total_incl_cents: number
  discount_cents: number
  payment_split: { cash_cents: number; pin_cents: number; ideal_cents: number; other_cents: number }
  first_order_at: string | null
  last_order_at: string | null
}

const BTW_RATES: Record<BtwClass, 0 | 9 | 21> = {
  food_9: 9,
  nonalc_beer_9: 9,
  alcohol_21: 21,
  soda_21: 21,
  deposit_0: 0,
  service_0: 0,
}

function emptyBreakdown(): ZReport["btw_breakdown"] {
  const keys: BtwClass[] = [
    "food_9",
    "nonalc_beer_9",
    "alcohol_21",
    "soda_21",
    "deposit_0",
    "service_0",
  ]
  return Object.fromEntries(
    keys.map((k) => [k, { excl_cents: 0, btw_cents: 0, incl_cents: 0, rate: BTW_RATES[k] }]),
  ) as ZReport["btw_breakdown"]
}

export async function computeZReport(args: {
  orgId: string
  venueId: string
  date: string // YYYY-MM-DD in Europe/Amsterdam
}): Promise<ZReport> {
  const supabase = await createClient()

  // Day boundaries in Europe/Amsterdam.
  const start = `${args.date}T00:00:00+02:00`
  const end = `${args.date}T23:59:59.999+02:00`

  const { data: orders, error } = await supabase
    .from("pos_orders")
    .select(
      `id, status, placed_at, paid_at, discount_cents,
       items:pos_order_items (btw_class, line_excl_cents, line_btw_cents, line_incl_cents),
       payments:pos_payments (method, status, amount_cents)`,
    )
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
    .gte("placed_at", start)
    .lte("placed_at", end)
    .in("status", ["paid", "refunded", "voided", "served", "ready", "preparing", "placed"])
  if (error) throw error

  const breakdown = emptyBreakdown()
  let total_excl = 0
  let total_btw = 0
  let total_incl = 0
  let discount = 0
  let order_count = 0
  let refund_count = 0
  let void_count = 0
  let first: string | null = null
  let last: string | null = null
  const pay = { cash_cents: 0, pin_cents: 0, ideal_cents: 0, other_cents: 0 }

  for (const o of (orders ?? []) as Array<{
    id: string
    status: string
    placed_at: string
    paid_at: string | null
    discount_cents: number
    items: Array<{ btw_class: BtwClass; line_excl_cents: number; line_btw_cents: number; line_incl_cents: number }>
    payments: Array<{ method: "cash" | "pin" | "ideal" | "gift_card" | "other"; status: string; amount_cents: number }>
  }>) {
    if (o.status === "voided") {
      void_count += 1
      continue
    }
    if (o.status === "refunded") refund_count += 1
    if (!["paid", "refunded", "served"].includes(o.status)) {
      // Not yet closed — exclude from Z totals but still inform the manager.
      continue
    }
    order_count += 1
    discount += o.discount_cents
    if (!first || o.placed_at < first) first = o.placed_at
    if (!last || o.placed_at > last) last = o.placed_at

    for (const it of o.items ?? []) {
      const b = breakdown[it.btw_class]
      b.excl_cents += it.line_excl_cents
      b.btw_cents += it.line_btw_cents
      b.incl_cents += it.line_incl_cents
      total_excl += it.line_excl_cents
      total_btw += it.line_btw_cents
      total_incl += it.line_incl_cents
    }
    for (const p of o.payments ?? []) {
      if (p.status !== "captured") continue
      const amount = p.amount_cents
      if (p.method === "cash") pay.cash_cents += amount
      else if (p.method === "pin") pay.pin_cents += amount
      else if (p.method === "ideal") pay.ideal_cents += amount
      else pay.other_cents += amount
    }
  }

  return {
    date: args.date,
    org_id: args.orgId,
    venue_id: args.venueId,
    order_count,
    refund_count,
    void_count,
    btw_breakdown: breakdown,
    total_excl_cents: total_excl,
    total_btw_cents: total_btw,
    total_incl_cents: total_incl,
    discount_cents: discount,
    payment_split: pay,
    first_order_at: first,
    last_order_at: last,
  }
}

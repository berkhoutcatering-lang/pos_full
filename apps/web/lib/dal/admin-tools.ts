import "server-only"
import { createClient } from "@/lib/supabase/server"
import { computeZReport } from "./dagafsluiting"
import type { BtwClass } from "@/lib/pos/types"

// The DAL functions exposed as Anthropic tools in /admin/chat. Each runs
// under the user's auth context — RLS scopes reads to the user's org;
// the venue_id arg is taken from the user's claims, NEVER from the model.

export interface ToolClaims {
  orgId: string
  venueId: string
  userId: string
}

const AMS_TZ = "Europe/Amsterdam"

function todayInAmsterdam(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: AMS_TZ }).format(new Date())
}

export async function get_daily_revenue(
  input: { date?: string },
  claims: ToolClaims,
) {
  const date = input.date ?? todayInAmsterdam()
  const report = await computeZReport({
    orgId: claims.orgId,
    venueId: claims.venueId,
    date,
  })
  return {
    date,
    order_count: report.order_count,
    total_incl_eur: (report.total_incl_cents / 100).toFixed(2),
    total_excl_eur: (report.total_excl_cents / 100).toFixed(2),
    total_btw_eur: (report.total_btw_cents / 100).toFixed(2),
    btw_per_class: Object.fromEntries(
      Object.entries(report.btw_breakdown).map(([k, v]) => [
        k,
        {
          rate_pct: v.rate,
          excl_eur: (v.excl_cents / 100).toFixed(2),
          btw_eur: (v.btw_cents / 100).toFixed(2),
        },
      ]),
    ) as Record<BtwClass, { rate_pct: number; excl_eur: string; btw_eur: string }>,
    payment_split_eur: {
      cash: (report.payment_split.cash_cents / 100).toFixed(2),
      pin: (report.payment_split.pin_cents / 100).toFixed(2),
      ideal: (report.payment_split.ideal_cents / 100).toFixed(2),
    },
  }
}

export async function get_top_items(
  input: { from: string; to: string; limit?: number },
  claims: ToolClaims,
) {
  const limit = Math.min(50, Math.max(1, input.limit ?? 10))
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_order_items")
    .select(
      "menu_item_id, name, qty, line_incl_cents, order:pos_orders!inner (placed_at, status)",
    )
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
    .gte("created_at", `${input.from}T00:00:00+02:00`)
    .lte("created_at", `${input.to}T23:59:59+02:00`)
  if (error) throw error

  const byItem = new Map<
    string,
    { name: string; qty: number; revenue_cents: number }
  >()
  // PostgREST returns the !inner embed as a single object at runtime, but
  // supabase-js infers it as an array — cast through unknown (as elsewhere
  // in the DAL) to assert the to-one shape we actually get.
  for (const row of (data ?? []) as unknown as Array<{
    menu_item_id: string | null
    name: string
    qty: number
    line_incl_cents: number
    order: { status: string }
  }>) {
    if (!row.menu_item_id) continue
    if (!["paid", "refunded", "served"].includes(row.order?.status ?? "")) continue
    const cur = byItem.get(row.menu_item_id) ?? {
      name: row.name,
      qty: 0,
      revenue_cents: 0,
    }
    cur.qty += row.qty
    cur.revenue_cents += row.line_incl_cents
    byItem.set(row.menu_item_id, cur)
  }
  return Array.from(byItem.entries())
    .map(([id, v]) => ({
      menu_item_id: id,
      name: v.name,
      qty: v.qty,
      revenue_eur: (v.revenue_cents / 100).toFixed(2),
    }))
    .sort((a, b) => Number(b.revenue_eur) - Number(a.revenue_eur))
    .slice(0, limit)
}

export async function list_open_orders(
  _input: Record<string, never>,
  claims: ToolClaims,
) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("pos_orders")
    .select(
      "id, ordered_label, status, customer_name, total_incl_cents, placed_at",
    )
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
    .in("status", ["placed", "preparing", "ready"])
    .order("placed_at", { ascending: true })
  if (error) throw error
  return (data ?? []).map((o) => ({
    id: o.id,
    label: o.ordered_label,
    status: o.status,
    customer: o.customer_name,
    total_eur: (o.total_incl_cents / 100).toFixed(2),
    placed_at: o.placed_at,
  }))
}

export async function compute_z_report(
  input: { date: string },
  claims: ToolClaims,
) {
  return computeZReport({
    orgId: claims.orgId,
    venueId: claims.venueId,
    date: input.date,
  })
}

export const TOOL_REGISTRY = {
  get_daily_revenue,
  get_top_items,
  list_open_orders,
  compute_z_report,
} as const

export type ToolName = keyof typeof TOOL_REGISTRY

"use server"
import { z } from "zod"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { ULID_RE } from "@hopbites/shared/ulid"

const BumpSchema = z.object({
  order_id: z.string().uuid(),
  to_status: z.enum(["preparing", "ready", "served"]),
  // Client supplies the idempotency_key so a double-tap collapses to one
  // state transition. Server stores result in pos_idempotency.
  idempotency_key: z.string().regex(ULID_RE),
})

type BumpResult =
  | { ok: true; order_id: string; status: "preparing" | "ready" | "served" }
  | { ok: false; error: string }

export async function bumpOrderAction(raw: unknown): Promise<BumpResult> {
  await requireRole("cashier")
  const claims = await requireVenue()

  const parsed = BumpSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("pos_idempotency")
    .select("result")
    .eq("idempotency_key", parsed.data.idempotency_key)
    .maybeSingle()
  if (existing) {
    const r = existing.result as { order_id?: string; status?: string }
    if (r?.order_id && r.status) {
      return {
        ok: true,
        order_id: r.order_id,
        status: r.status as "preparing" | "ready" | "served",
      }
    }
  }

  const nowIso = new Date().toISOString()
  const updates: Record<string, unknown> = { status: parsed.data.to_status }
  if (parsed.data.to_status === "preparing") updates.prepared_at = nowIso
  if (parsed.data.to_status === "served") updates.served_at = nowIso

  const { error } = await supabase
    .from("pos_orders")
    .update(updates)
    .eq("id", parsed.data.order_id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) return { ok: false, error: "update_failed" }

  // Defensive upsert — a race that slips past the SELECT lands here, and
  // the existing row is already correct (same key, same result).
  await supabase
    .from("pos_idempotency")
    .upsert(
      {
        idempotency_key: parsed.data.idempotency_key,
        org_id: claims.orgId,
        venue_id: claims.venueId,
        operation: "order.update",
        result: { order_id: parsed.data.order_id, status: parsed.data.to_status },
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )

  // Kitchen ticket is printed at order placement (Phase 3 kassa checkout),
  // not here, so a bump is a pure state change.

  return {
    ok: true,
    order_id: parsed.data.order_id,
    status: parsed.data.to_status,
  }
}

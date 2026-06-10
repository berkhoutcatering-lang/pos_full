"use server"
import { z } from "zod"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { isNetworkError } from "@/lib/offline/cache"
import { ULID_RE } from "@hopbites/shared/ulid"

// "placed" is een geldige TERUG-transitie: de keuken kan een kaart weer
// terugslepen (bijv. per ongeluk gestart). served blijft alleen vooruit.
const BumpSchema = z.object({
  order_id: z.string().uuid(),
  to_status: z.enum(["placed", "preparing", "ready", "served"]),
  // Client supplies the idempotency_key so a double-tap collapses to one
  // state transition. Server stores result in pos_idempotency.
  idempotency_key: z.string().regex(ULID_RE),
})

type BumpStatus = "placed" | "preparing" | "ready" | "served"

type BumpResult =
  | { ok: true; order_id: string; status: BumpStatus }
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
        status: r.status as BumpStatus,
      }
    }
  }

  const nowIso = new Date().toISOString()
  const updates: Record<string, unknown> = { status: parsed.data.to_status }
  if (parsed.data.to_status === "placed") updates.prepared_at = null
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

const RefundSchema = z.object({
  order_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(200),
})

type RefundResult = { ok: true } | { ok: false; error: string }

// Terugbetalen markeert de order als refunded + verzegelt een audit-event.
// Het geld zelf gaat handmatig (cash uit de lade / PIN via de myPOS-app) —
// dit is de administratieve kant. Manager-only.
export async function refundOrderAction(raw: unknown): Promise<RefundResult> {
  const claims = await requireRole("manager")
  const venueClaims = await requireVenue()
  const parsed = RefundSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { data: order, error } = await supabase
    .from("pos_orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", parsed.data.order_id)
    .eq("org_id", venueClaims.orgId)
    .eq("venue_id", venueClaims.venueId)
    .in("status", ["served", "voided"])
    .select("id, total_incl_cents, ordered_label")
    .maybeSingle()
  if (error) {
    if (isNetworkError(error)) return { ok: false, error: "offline" }
    return { ok: false, error: "update_failed" }
  }
  if (!order) return { ok: false, error: "not_refundable" }

  await supabase.rpc("write_audit_log", {
    p_org_id: venueClaims.orgId,
    p_venue_id: venueClaims.venueId,
    p_actor_user_id: claims.userId,
    p_actor_terminal_id: null,
    p_event_type: "order.refunded",
    p_payload: {
      order_id: order.id,
      ordered_label: order.ordered_label,
      amount_cents: order.total_incl_cents,
      reason: parsed.data.reason,
      canonical_json_version: "2026-05-18-a",
    },
  })
  return { ok: true }
}

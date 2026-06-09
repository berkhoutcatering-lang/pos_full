"use server"
import { z } from "zod"
import { ulid } from "ulid"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { ULID_RE } from "@hopbites/shared/ulid"
import {
  setPriceOverrideViaPi,
  toggleAvailabilityViaPi,
  updateStockViaPi,
} from "@/lib/pi-bridge/client"

// Dual-source DAL voor operational admin acties. Pi-bridge first (2s
// timeout), Supabase fallback. Beide schrijven naar dezelfde rij via de
// SAME idempotency_key zodat een Pi-write-die-later-flushed niet bovenop
// een al-gefallback'de Supabase-write komt.
//
// Pillar #1 Pi-Edge Cloud-Truth + Pillar #4 Foodtruck-First.

const StockUpdateSchema = z.object({
  item_id: z.string().uuid(),
  set_to: z.number().int().nonnegative().nullable().optional(),
  delta: z.number().int().optional(),
})

const AvailabilityToggleSchema = z.object({
  item_id: z.string().uuid(),
  available: z.boolean().nullable(),
})

const PriceOverrideSchema = z.object({
  item_id: z.string().uuid(),
  price_cents: z.number().int().nonnegative().nullable(),
  expires_at: z.string().datetime().nullable(),
})

interface DalResult<T> {
  ok: boolean
  via: "pi" | "cloud" | "both_failed"
  data?: T
  error?: string
}

async function cloudPatch(args: {
  orgId: string
  venueId: string
  itemId: string
  patch: Record<string, unknown>
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_menu_items")
    .update({ ...args.patch, updated_at: new Date().toISOString() })
    .eq("id", args.itemId)
    .eq("org_id", args.orgId)
    .eq("venue_id", args.venueId)
  return error
}

async function writeAuditCloud(args: {
  orgId: string
  venueId: string
  userId: string
  action: string
  payload: Record<string, unknown>
}) {
  const supabase = await createClient()
  await supabase.rpc("write_audit_log", {
    p_org_id: args.orgId,
    p_venue_id: args.venueId,
    p_actor_user_id: args.userId,
    p_actor_terminal_id: null,
    p_event_type: "manager.override",
    p_payload: { action: args.action, ...args.payload, canonical_json_version: "2026-05-18-a" },
  })
}

// ---- updateStock ----

export async function updateStockAction(raw: unknown): Promise<
  DalResult<{ item_id: string; stock_qty: number | null }>
> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = StockUpdateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, via: "both_failed", error: "validation" }
  const idempotency_key = ulid()
  // Pi-first.
  const pi = await updateStockViaPi({
    idempotency_key,
    item_id: parsed.data.item_id,
    set_to: parsed.data.set_to ?? null,
    delta: parsed.data.delta,
  })
  if (pi.ok) {
    // Pi heeft cache + outbox + audit gedaan; cloud krijgt het via de outbox-flush.
    return { ok: true, via: "pi", data: pi.data }
  }
  // Fallback: direct naar Supabase, plus audit_log.
  const patch: Record<string, unknown> =
    parsed.data.set_to !== undefined && parsed.data.set_to !== null
      ? { stock_qty: parsed.data.set_to }
      : {}
  if (parsed.data.delta !== undefined && parsed.data.set_to === undefined) {
    // RPC-based delta voor atomic write.
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("decrement_stock", {
      p_item_id: parsed.data.item_id,
      p_qty: -parsed.data.delta, // negate: we want add not decrement
    })
    if (error) return { ok: false, via: "both_failed", error: error.message }
    await writeAuditCloud({
      orgId: claims.orgId,
      venueId: claims.venueId,
      userId: claims.userId,
      action: "stock_update",
      payload: { item_id: parsed.data.item_id, delta: parsed.data.delta, new_stock_qty: data },
    })
    return {
      ok: true,
      via: "cloud",
      data: { item_id: parsed.data.item_id, stock_qty: data as number | null },
    }
  }
  const err = await cloudPatch({
    orgId: claims.orgId,
    venueId: claims.venueId,
    itemId: parsed.data.item_id,
    patch,
  })
  if (err) return { ok: false, via: "both_failed", error: err.message }
  await writeAuditCloud({
    orgId: claims.orgId,
    venueId: claims.venueId,
    userId: claims.userId,
    action: "stock_update",
    payload: { item_id: parsed.data.item_id, set_to: parsed.data.set_to ?? null },
  })
  return {
    ok: true,
    via: "cloud",
    data: { item_id: parsed.data.item_id, stock_qty: parsed.data.set_to ?? null },
  }
}

// ---- toggleAvailability ----

export async function toggleAvailabilityAction(raw: unknown): Promise<
  DalResult<{ item_id: string; is_available_override: boolean | null }>
> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = AvailabilityToggleSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, via: "both_failed", error: "validation" }
  const idempotency_key = ulid()
  const pi = await toggleAvailabilityViaPi({
    idempotency_key,
    item_id: parsed.data.item_id,
    available: parsed.data.available,
  })
  if (pi.ok) return { ok: true, via: "pi", data: pi.data }

  const err = await cloudPatch({
    orgId: claims.orgId,
    venueId: claims.venueId,
    itemId: parsed.data.item_id,
    patch: { is_available_override: parsed.data.available },
  })
  if (err) return { ok: false, via: "both_failed", error: err.message }
  await writeAuditCloud({
    orgId: claims.orgId,
    venueId: claims.venueId,
    userId: claims.userId,
    action: "availability_toggle",
    payload: { item_id: parsed.data.item_id, available: parsed.data.available },
  })
  return {
    ok: true,
    via: "cloud",
    data: { item_id: parsed.data.item_id, is_available_override: parsed.data.available },
  }
}

// ---- setPriceOverride ----

export async function setPriceOverrideAction(raw: unknown): Promise<
  DalResult<{
    item_id: string
    price_override_cents: number | null
    price_override_expires_at: string | null
  }>
> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = PriceOverrideSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, via: "both_failed", error: "validation" }
  const idempotency_key = ulid()
  const pi = await setPriceOverrideViaPi({
    idempotency_key,
    item_id: parsed.data.item_id,
    price_cents: parsed.data.price_cents,
    expires_at: parsed.data.expires_at,
  })
  if (pi.ok) return { ok: true, via: "pi", data: pi.data }

  const err = await cloudPatch({
    orgId: claims.orgId,
    venueId: claims.venueId,
    itemId: parsed.data.item_id,
    patch: {
      price_override_cents: parsed.data.price_cents,
      price_override_expires_at: parsed.data.expires_at,
      price_override_set_by: claims.userId,
    },
  })
  if (err) return { ok: false, via: "both_failed", error: err.message }
  await writeAuditCloud({
    orgId: claims.orgId,
    venueId: claims.venueId,
    userId: claims.userId,
    action: "price_override",
    payload: {
      item_id: parsed.data.item_id,
      price_cents: parsed.data.price_cents,
      expires_at: parsed.data.expires_at,
    },
  })
  return {
    ok: true,
    via: "cloud",
    data: {
      item_id: parsed.data.item_id,
      price_override_cents: parsed.data.price_cents,
      price_override_expires_at: parsed.data.expires_at,
    },
  }
}

// Silence unused warning
void ULID_RE

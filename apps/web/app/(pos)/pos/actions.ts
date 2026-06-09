"use server"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { ULID_RE } from "@hopbites/shared/ulid"
import { btwRateFor } from "@/lib/pos/btw"

const ItemSchema = z.object({
  position: z.number().int().nonnegative(),
  menu_item_id: z.string().uuid(),
  name: z.string().max(120),
  category: z.string().max(60).nullable().optional(),
  qty: z.number().int().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  modifier_total_cents: z.number().int().nonnegative(),
  discount_cents: z.number().int().nonnegative(),
  btw_class: z.enum([
    "food_9",
    "alcohol_21",
    "soda_21",
    "nonalc_beer_9",
    "deposit_0",
    "service_0",
  ]),
  btw_rate: z.number().int(),
  line_excl_cents: z.number().int().nonnegative(),
  line_btw_cents: z.number().int().nonnegative(),
  line_incl_cents: z.number().int().nonnegative(),
  modifiers_json: z.any(),
  notes: z.string().max(200).nullable().optional(),
})

const PlaceOrderInput = z.object({
  idempotency_key: z.string().regex(ULID_RE),
  order_id: z.string().uuid().optional(),
  customer_name: z.string().max(64).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  items: z.array(ItemSchema).min(1).max(50),
  subtotal_cents: z.number().int().nonnegative(),
  discount_cents: z.number().int().nonnegative(),
  total_excl_cents: z.number().int().nonnegative(),
  total_btw_cents: z.number().int().nonnegative(),
  total_incl_cents: z.number().int().nonnegative(),
})

type PlaceOrderResult =
  | { ok: true; order_id: string }
  | { ok: false; error: string }

export async function placeOrderAction(raw: unknown): Promise<PlaceOrderResult> {
  await requireRole("cashier")
  const claims = await requireVenue()

  const parsed = PlaceOrderInput.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  // Cross-check BTW rate matches the class — defence against tampered payload.
  for (const it of parsed.data.items) {
    if (btwRateFor(it.btw_class) !== it.btw_rate) {
      return { ok: false, error: "btw_rate_mismatch" }
    }
  }

  const supabase = await createClient()

  // Idempotency check.
  const { data: existing } = await supabase
    .from("pos_idempotency")
    .select("result")
    .eq("idempotency_key", parsed.data.idempotency_key)
    .maybeSingle()
  if (existing) {
    const r = existing.result as { order_id?: string }
    if (r?.order_id) return { ok: true, order_id: r.order_id }
  }

  const orderId = parsed.data.order_id ?? crypto.randomUUID()

  const { error: orderErr } = await supabase.from("pos_orders").insert({
    id: orderId,
    org_id: claims.orgId,
    venue_id: claims.venueId,
    idempotency_key: parsed.data.idempotency_key,
    source: "kassa",
    status: "placed",
    customer_name: parsed.data.customer_name ?? null,
    notes: parsed.data.notes ?? null,
    subtotal_cents: parsed.data.subtotal_cents,
    discount_cents: parsed.data.discount_cents,
    total_excl_cents: parsed.data.total_excl_cents,
    total_btw_cents: parsed.data.total_btw_cents,
    total_incl_cents: parsed.data.total_incl_cents,
    created_by_user_id: claims.userId,
  })
  if (orderErr) {
    // Race: parallel request slipped past the idempotency SELECT.
    // unique_violation on pos_orders.idempotency_key means the order is
    // already in flight elsewhere — re-read and treat as success.
    if ((orderErr as { code?: string }).code === "23505") {
      const { data: existingOrder } = await supabase
        .from("pos_orders")
        .select("id")
        .eq("idempotency_key", parsed.data.idempotency_key)
        .maybeSingle()
      if (existingOrder?.id) return { ok: true, order_id: existingOrder.id as string }
    }
    return { ok: false, error: "order_insert_failed" }
  }

  const itemsToInsert = parsed.data.items.map((it) => ({
    order_id: orderId,
    org_id: claims.orgId,
    venue_id: claims.venueId,
    position: it.position,
    menu_item_id: it.menu_item_id,
    name: it.name,
    category: it.category ?? null,
    qty: it.qty,
    unit_price_cents: it.unit_price_cents,
    modifier_total_cents: it.modifier_total_cents,
    discount_cents: it.discount_cents,
    btw_class: it.btw_class,
    btw_rate: it.btw_rate,
    line_excl_cents: it.line_excl_cents,
    line_btw_cents: it.line_btw_cents,
    line_incl_cents: it.line_incl_cents,
    modifiers_json: it.modifiers_json ?? [],
    notes: it.notes ?? null,
  }))
  const { error: itemsErr } = await supabase
    .from("pos_order_items")
    .insert(itemsToInsert)
  if (itemsErr) return { ok: false, error: "items_insert_failed" }

  await supabase.from("pos_idempotency").insert({
    idempotency_key: parsed.data.idempotency_key,
    org_id: claims.orgId,
    venue_id: claims.venueId,
    operation: "order.create",
    result: { order_id: orderId },
  })

  revalidatePath("/pos")
  return { ok: true, order_id: orderId }
}

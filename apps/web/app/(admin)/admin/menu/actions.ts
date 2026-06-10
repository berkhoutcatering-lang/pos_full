"use server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ulid } from "ulid"
import { createClient } from "@/lib/supabase/server"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { isNetworkError, offlineCacheRead } from "@/lib/offline/cache"
import { applyMenuMutationToLocalCaches } from "@/lib/offline/menu-cache"
import { queueMenuUpsertViaPi } from "@/lib/pi-bridge/server"
import type { AdminMenuItem } from "@/lib/dal/admin-menu"
import type { Claims } from "@/lib/dal/auth"

// Menu CRUD. Online gaan writes onder de user-client (RLS:
// is_member_with_role(org_id,'manager')). Zonder internet vallen ze terug
// op de Pi-bridge: PGlite cache + outbox, die automatisch upsert naar
// pos_menu_items zodra Supabase weer bereikbaar is. BTW-klasse is altijd
// een expliciete keuze — nooit afgeleid.

const BtwClass = z.enum([
  "food_9",
  "alcohol_21",
  "soda_21",
  "nonalc_beer_9",
  "deposit_0",
  "service_0",
])

const ItemFields = z.object({
  name: z.string().trim().min(1).max(80),
  category: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9 &'-]+$/, "categorie: alleen letters/cijfers"),
  price_cents: z.number().int().min(0).max(100_000),
  btw_class: BtwClass,
  station: z.enum(["grill", "fryer", "cold", "bar"]).default("grill"),
  is_discountable: z.boolean().default(true),
})

const CreateSchema = ItemFields
const UpdateSchema = ItemFields.extend({ id: z.string().uuid() })
const DeactivateSchema = z.object({ id: z.string().uuid() })

type Result = { ok: true; queued?: boolean } | { ok: false; error: string }

type ItemInput = z.infer<typeof ItemFields> & { id: string }

async function audit(args: {
  claims: Claims
  action: string
  payload: Record<string, unknown>
}) {
  const supabase = await createClient()
  // Offline faalt deze RPC stil — de Pi-bridge schrijft in dat geval zijn
  // eigen (gequeued) audit-event bij de menu-upsert.
  await supabase.rpc("write_audit_log", {
    p_org_id: args.claims.orgId,
    p_venue_id: args.claims.venueId,
    p_actor_user_id: args.claims.userId,
    p_actor_terminal_id: null,
    p_event_type: args.action,
    p_payload: { ...args.payload, canonical_json_version: "2026-05-18-a" },
  })
}

// Offline pad: queue op de Pi + lokale last-good caches bijwerken zodat
// beheer en kassa de wijziging direct zien.
async function upsertViaPi(
  claims: Claims & { venueId: string },
  item: ItemInput,
  isActive: boolean,
): Promise<Result> {
  const res = await queueMenuUpsertViaPi({
    idempotency_key: ulid(),
    id: item.id,
    org_id: claims.orgId,
    venue_id: claims.venueId,
    name: item.name,
    category: item.category,
    base_price_cents: item.price_cents,
    btw_class: item.btw_class,
    station: item.station,
    is_discountable: item.is_discountable,
    is_active: isActive,
  })
  if (!res.ok) return { ok: false, error: "offline_failed" }
  await applyMenuMutationToLocalCaches({
    orgId: claims.orgId,
    venueId: claims.venueId,
    item: {
      id: item.id,
      name: item.name,
      category: item.category,
      base_price_cents: item.price_cents,
      btw_class: item.btw_class,
      station: item.station,
      is_discountable: item.is_discountable,
      sort_order: 100,
    },
    remove: !isActive,
  })
  revalidatePath("/admin/menu")
  return { ok: true, queued: true }
}

export async function createMenuItemAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = CreateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }
  // Id hier gegenereerd zodat het online- en offline-pad dezelfde rij
  // opleveren (outbox-upsert op id).
  const item: ItemInput = { ...parsed.data, id: crypto.randomUUID() }

  const supabase = await createClient()
  const { error } = await supabase.from("pos_menu_items").insert({
    id: item.id,
    org_id: claims.orgId,
    venue_id: claims.venueId,
    name: item.name,
    category: item.category,
    base_price_cents: item.price_cents,
    btw_class: item.btw_class,
    station: item.station,
    is_discountable: item.is_discountable,
  })
  if (error) {
    if (isNetworkError(error)) return upsertViaPi(claims, item, true)
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "name_exists" }
    }
    return { ok: false, error: "insert_failed" }
  }

  await audit({
    claims,
    action: "menu.item_created",
    payload: { item_id: item.id, name: item.name, price_cents: item.price_cents, btw_class: item.btw_class },
  })
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function updateMenuItemAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = UpdateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }
  const item: ItemInput = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_menu_items")
    .update({
      name: item.name,
      category: item.category,
      base_price_cents: item.price_cents,
      btw_class: item.btw_class,
      station: item.station,
      is_discountable: item.is_discountable,
    })
    .eq("id", item.id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) {
    if (isNetworkError(error)) return upsertViaPi(claims, item, true)
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "name_exists" }
    }
    return { ok: false, error: "update_failed" }
  }

  await audit({
    claims,
    action: "menu.item_updated",
    payload: { item_id: item.id, name: item.name, price_cents: item.price_cents },
  })
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function deactivateMenuItemAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = DeactivateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  // Soft delete: bestelde regels verwijzen naar dit item; is_active=false
  // haalt het overal uit beeld zonder historie te breken.
  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_menu_items")
    .update({ is_active: false })
    .eq("id", parsed.data.id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) {
    if (isNetworkError(error)) {
      // Volledige rij nodig voor de outbox-upsert — pak hem uit de
      // lokale beheer-cache.
      const cached = await offlineCacheRead<AdminMenuItem[]>(
        `admin-menu-${claims.orgId}-${claims.venueId}`,
      )
      const existing = cached?.find((i) => i.id === parsed.data.id)
      if (!existing) return { ok: false, error: "offline_failed" }
      return upsertViaPi(
        claims,
        {
          id: existing.id,
          name: existing.name,
          category: existing.category,
          price_cents: existing.base_price_cents,
          btw_class: existing.btw_class as z.infer<typeof BtwClass>,
          station: existing.station as ItemInput["station"],
          is_discountable: existing.is_discountable,
        },
        false,
      )
    }
    return { ok: false, error: "update_failed" }
  }

  await audit({
    claims,
    action: "menu.item_deactivated",
    payload: { item_id: parsed.data.id },
  })
  revalidatePath("/admin/menu")
  return { ok: true }
}

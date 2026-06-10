"use server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireRole, requireVenue } from "@/lib/dal/auth"

// Menu CRUD. Writes go through the user client: RLS
// (`is_member_with_role(org_id,'manager')` on pos_menu_items) is the
// authorization layer, requireRole is the early gate. Deterministic data
// only — BTW class is an explicit choice, never derived.

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

type Result = { ok: true } | { ok: false; error: string }

async function audit(args: {
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
    p_event_type: args.action,
    p_payload: { ...args.payload, canonical_json_version: "2026-05-18-a" },
  })
}

export async function createMenuItemAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = CreateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase.from("pos_menu_items").insert({
    org_id: claims.orgId,
    venue_id: claims.venueId,
    name: parsed.data.name,
    category: parsed.data.category,
    base_price_cents: parsed.data.price_cents,
    btw_class: parsed.data.btw_class,
    station: parsed.data.station,
    is_discountable: parsed.data.is_discountable,
  })
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "name_exists" }
    }
    return { ok: false, error: "insert_failed" }
  }

  await audit({
    orgId: claims.orgId,
    venueId: claims.venueId,
    userId: claims.userId,
    action: "menu.item_created",
    payload: { name: parsed.data.name, price_cents: parsed.data.price_cents, btw_class: parsed.data.btw_class },
  })
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function updateMenuItemAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = UpdateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_menu_items")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      base_price_cents: parsed.data.price_cents,
      btw_class: parsed.data.btw_class,
      station: parsed.data.station,
      is_discountable: parsed.data.is_discountable,
    })
    .eq("id", parsed.data.id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "name_exists" }
    }
    return { ok: false, error: "update_failed" }
  }

  await audit({
    orgId: claims.orgId,
    venueId: claims.venueId,
    userId: claims.userId,
    action: "menu.item_updated",
    payload: { item_id: parsed.data.id, name: parsed.data.name, price_cents: parsed.data.price_cents },
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
  if (error) return { ok: false, error: "update_failed" }

  await audit({
    orgId: claims.orgId,
    venueId: claims.venueId,
    userId: claims.userId,
    action: "menu.item_deactivated",
    payload: { item_id: parsed.data.id },
  })
  revalidatePath("/admin/menu")
  return { ok: true }
}

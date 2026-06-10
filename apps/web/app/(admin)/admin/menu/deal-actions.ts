"use server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { isNetworkError } from "@/lib/offline/cache"

// Combo-deals + staffelkorting CRUD. Net als optiegroepen online-only:
// deals stel je vooraf in, niet midden in de service zonder internet.
// Writes onder RLS (is_member_with_role manager); prijslogica zelf blijft
// deterministisch in lib/pos/pricing.ts.

type Result = { ok: true } | { ok: false; error: string }

function mapError(error: unknown): Result {
  if (isNetworkError(error)) return { ok: false, error: "offline" }
  if ((error as { code?: string }).code === "23505") return { ok: false, error: "name_exists" }
  return { ok: false, error: "save_failed" }
}

// ---------- combo's ----------

const ComboFields = z.object({
  name: z.string().trim().min(1).max(60),
  // item-id → minimaal aantal; de keys zijn meteen de trigger-items.
  trigger_min_qty: z
    .record(z.string().uuid(), z.number().int().min(1).max(20))
    .refine((r) => Object.keys(r).length >= 1, { message: "minimaal 1 trigger-item" }),
  discount_cents: z.number().int().min(1).max(100_000),
})

const ComboUpdateSchema = ComboFields.extend({ id: z.string().uuid() })
const IdSchema = z.object({ id: z.string().uuid() })

function comboRow(data: z.infer<typeof ComboFields>) {
  return {
    name: data.name,
    trigger_item_ids: Object.keys(data.trigger_min_qty),
    trigger_min_qty: data.trigger_min_qty,
    discount_cents: data.discount_cents,
  }
}

export async function createComboAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = ComboFields.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase.from("pos_combos").insert({
    org_id: claims.orgId,
    venue_id: claims.venueId,
    ...comboRow(parsed.data),
  })
  if (error) return mapError(error)
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function updateComboAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = ComboUpdateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_combos")
    .update(comboRow(parsed.data))
    .eq("id", parsed.data.id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) return mapError(error)
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function deactivateComboAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = IdSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_combos")
    .update({ is_active: false })
    .eq("id", parsed.data.id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) return mapError(error)
  revalidatePath("/admin/menu")
  return { ok: true }
}

// ---------- staffels ----------

const StaffelFields = z.object({
  name: z.string().trim().min(1).max(60),
  applies_to_item_ids: z.array(z.string().uuid()).min(1).max(50),
  qty_threshold: z.number().int().min(1).max(100),
  discount_per_extra_cents: z.number().int().min(1).max(10_000),
})

const StaffelUpdateSchema = StaffelFields.extend({ id: z.string().uuid() })

export async function createStaffelAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = StaffelFields.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase.from("pos_staffels").insert({
    org_id: claims.orgId,
    venue_id: claims.venueId,
    ...parsed.data,
  })
  if (error) return mapError(error)
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function updateStaffelAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = StaffelUpdateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const { id, ...fields } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_staffels")
    .update(fields)
    .eq("id", id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) return mapError(error)
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function deactivateStaffelAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = IdSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_staffels")
    .update({ is_active: false })
    .eq("id", parsed.data.id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) return mapError(error)
  revalidatePath("/admin/menu")
  return { ok: true }
}

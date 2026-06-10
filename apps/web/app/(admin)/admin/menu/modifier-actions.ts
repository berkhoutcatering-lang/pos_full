"use server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { isNetworkError } from "@/lib/offline/cache"

// Optiegroepen (modifier groups) CRUD. Online-only: groepen wijzig je
// zelden en de kassa leest ze uit de cache — offline bewerken zou een
// eigen outbox-pad vragen voor iets dat in de praktijk thuis gebeurt.
// Writes onder RLS (is_member_with_role manager).

const OptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  surcharge_cents: z.number().int().min(-10_000).max(10_000),
})

const GroupFields = z
  .object({
    name: z.string().trim().min(1).max(60),
    min_select: z.number().int().min(0).max(10),
    max_select: z.number().int().min(1).max(10),
    options: z.array(OptionSchema).min(1).max(20),
  })
  .refine((g) => g.max_select >= g.min_select, {
    message: "max_select moet >= min_select zijn",
  })

const CreateSchema = GroupFields
const UpdateSchema = z.object({ id: z.string().uuid() }).and(GroupFields)
const DeactivateSchema = z.object({ id: z.string().uuid() })

type Result = { ok: true } | { ok: false; error: string }

export async function createModifierGroupAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = CreateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase.from("pos_modifier_groups").insert({
    org_id: claims.orgId,
    venue_id: claims.venueId,
    name: parsed.data.name,
    min_select: parsed.data.min_select,
    max_select: parsed.data.max_select,
    options: parsed.data.options,
  })
  if (error) {
    if (isNetworkError(error)) return { ok: false, error: "offline" }
    if ((error as { code?: string }).code === "23505") return { ok: false, error: "name_exists" }
    return { ok: false, error: "insert_failed" }
  }
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function updateModifierGroupAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = UpdateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("pos_modifier_groups")
    .update({
      name: parsed.data.name,
      min_select: parsed.data.min_select,
      max_select: parsed.data.max_select,
      options: parsed.data.options,
    })
    .eq("id", parsed.data.id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) {
    if (isNetworkError(error)) return { ok: false, error: "offline" }
    if ((error as { code?: string }).code === "23505") return { ok: false, error: "name_exists" }
    return { ok: false, error: "update_failed" }
  }
  revalidatePath("/admin/menu")
  return { ok: true }
}

export async function deactivateModifierGroupAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = DeactivateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const supabase = await createClient()
  // Soft delete + losmaken van items die de groep nog gebruiken.
  const { error } = await supabase
    .from("pos_modifier_groups")
    .update({ is_active: false })
    .eq("id", parsed.data.id)
    .eq("org_id", claims.orgId)
    .eq("venue_id", claims.venueId)
  if (error) {
    if (isNetworkError(error)) return { ok: false, error: "offline" }
    return { ok: false, error: "update_failed" }
  }
  revalidatePath("/admin/menu")
  return { ok: true }
}
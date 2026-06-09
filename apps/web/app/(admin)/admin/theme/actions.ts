"use server"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"

const Schema = z.object({
  preset: z.enum([
    "hopbites",
    "neutral",
    "warm-grey",
    "blueprint",
    "midnight",
    "spring",
    "autumn",
    "festival",
  ]),
  brand_name: z.string().min(1).max(80),
  brand_logo_url: z.string().url().max(2048).nullable(),
})

export async function saveThemeAction(raw: unknown) {
  const claims = await requireRole("manager")
  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false as const, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase
    .from("org_theme_settings")
    .upsert(
      {
        org_id: claims.orgId,
        preset: parsed.data.preset,
        brand_name: parsed.data.brand_name,
        brand_logo_url: parsed.data.brand_logo_url,
      },
      { onConflict: "org_id" },
    )
  if (error) return { ok: false as const, error: "update_failed" }

  revalidatePath("/", "layout")
  return { ok: true as const }
}

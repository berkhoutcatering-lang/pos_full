"use server"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"

// Elk veld mag leeg blijven. Dat is geen slordigheid maar het ontwerp: leeg
// betekent "die regel niet op de bon printen". Een bon zonder KvK-nummer is
// beter dan een bon met een KvK-nummer dat niet klopt — en dat laatste is
// precies wat er gebeurde toen deze gegevens nog hardcoded in de kassa stonden.
const blankToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable())

const Schema = z.object({
  legal_name: optionalText(80),
  // Geen strengere check dan de lengte: een KvK-nummer is 8 cijfers, maar een
  // buitenlandse of nieuwe inschrijving hoeft daar niet aan te voldoen en de
  // kassa is niet de plek om dat te blokkeren.
  kvk: optionalText(20),
  btw_id: optionalText(20),
  address_line: optionalText(120),
  postal_code: optionalText(12),
  city: optionalText(60),
  phone: optionalText(30),
  website: optionalText(120),
  footer_text: optionalText(200),
  print_logo: z.boolean(),
})

export async function saveReceiptSettingsAction(raw: unknown) {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false as const, error: "validation" }

  const supabase = await createClient()
  const { error } = await supabase.from("pos_receipt_settings").upsert(
    {
      venue_id: claims.venueId,
      org_id: claims.orgId,
      ...parsed.data,
    },
    { onConflict: "venue_id" },
  )
  if (error) return { ok: false as const, error: "update_failed" }

  // De Pi print uit zijn eigen kopie, dus zonder deze duw staat de oude tekst
  // nog tot vijf minuten lang op de bonnen. Mislukt hij (Pi even weg), dan is
  // dat geen fout: de achtergrond-refresh haalt hem vanzelf op.
  let piSynced = true
  try {
    const res = await fetch(
      `${process.env.PI_BRIDGE_URL ?? "https://hopbites.local:3001"}/receipt-settings/refresh`,
      {
        method: "POST",
        headers: { "x-admin-token": process.env.PI_BRIDGE_ADMIN_TOKEN ?? "" },
        signal: AbortSignal.timeout(4000),
      },
    )
    piSynced = res.ok
  } catch {
    piSynced = false
  }

  revalidatePath("/admin/bon")
  return { ok: true as const, pi_synced: piSynced }
}

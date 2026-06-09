"use server"
import { z } from "zod"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { computeZReport } from "@/lib/dal/dagafsluiting"
import { renderZRapportPdf } from "@/lib/pdf/z-rapport"

const Schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

// Download endpoint for the Z-rapport PDF. Manager-only. Includes the
// hash anchor (latest audit_log seq for this org) so the PDF is
// cryptographically pinned to the chain at this moment.

export async function downloadZRapportAction(raw: unknown) {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = Schema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false as const, error: "validation" }
  }

  const report = await computeZReport({
    orgId: claims.orgId,
    venueId: claims.venueId,
    date: parsed.data.date,
  })

  const supabase = await createClient()
  const [{ data: org }, { data: venue }, { data: anchor }] = await Promise.all([
    supabase.from("orgs").select("name, kvk_number, btw_number").eq("id", claims.orgId).maybeSingle(),
    supabase.from("venues").select("name").eq("id", claims.venueId).maybeSingle(),
    supabase
      .from("audit_log")
      .select("seq_id, hash_curr")
      .eq("org_id", claims.orgId)
      .order("seq_id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const pdfBuffer = await renderZRapportPdf({
    report,
    tenant: {
      name: (org?.name as string) ?? "POS",
      kvk: (org?.kvk_number as string) ?? "—",
      btw: (org?.btw_number as string) ?? "—",
    },
    venue_name: (venue?.name as string) ?? "Onbekend",
    audit_anchor: anchor
      ? { seq_id: anchor.seq_id as number, hash_curr: anchor.hash_curr as string }
      : undefined,
  })

  return {
    ok: true as const,
    filename: `z-rapport-${parsed.data.date}.pdf`,
    pdf_base64: pdfBuffer.toString("base64"),
  }
}

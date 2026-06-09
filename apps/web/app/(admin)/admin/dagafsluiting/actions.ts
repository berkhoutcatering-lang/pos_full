"use server"
import { ulid } from "ulid"
import { z } from "zod"
import { createClient as createSbClient } from "@supabase/supabase-js"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { computeZReport } from "@/lib/dal/dagafsluiting"

const Schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })

function admin() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function closeDayAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole("manager")
  const claims = await requireVenue()
  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const report = await computeZReport({
    orgId: claims.orgId,
    venueId: claims.venueId,
    date: parsed.data.date,
  })

  const supabase = admin()

  // Idempotency: unique (org_id, venue_id, business_date) collapses retries.
  const idempotency_key = ulid()
  const { error: insertErr } = await supabase
    .from("dagafsluiting_records")
    .insert({
      org_id: claims.orgId,
      venue_id: claims.venueId,
      business_date: parsed.data.date,
      closed_by_user_id: claims.userId,
      report_json: report,
      idempotency_key,
    })
  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      // Racing tab already closed this day — return OK without re-firing
      // the audit_log entry or the Z-rapport print.
      return { ok: true }
    }
    return { ok: false, error: "insert_failed" }
  }

  // SBA Fase 4 hash-chain event.
  await supabase.rpc("write_audit_log", {
    p_org_id: claims.orgId,
    p_venue_id: claims.venueId,
    p_actor_user_id: claims.userId,
    p_actor_terminal_id: null,
    p_event_type: "shift.closed",
    p_payload: {
      business_date: parsed.data.date,
      total_incl_cents: report.total_incl_cents,
      total_btw_cents: report.total_btw_cents,
      order_count: report.order_count,
      btw_breakdown: report.btw_breakdown,
      payment_split: report.payment_split,
    },
  })

  // Fire-and-forget Z-rapport print via Pi-bridge customer printer.
  // Phase 2 Pi-bridge currently exposes /print/receipt; the Z-rapport is
  // a customer-bon-shaped print with the day header.
  void fetch(`https://hopbites.local:3001/print/receipt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": process.env.PI_BRIDGE_ADMIN_TOKEN ?? "",
    },
    body: JSON.stringify({
      idempotency_key: ulid(),
      order_id: crypto.randomUUID(),
      order_label: `Z-rapport ${parsed.data.date}`,
      items: Object.entries(report.btw_breakdown).map(([cls, b]) => ({
        name: `${cls} (${b.rate}%)`,
        qty: 1,
        price_cents: b.incl_cents,
        btw_rate: b.rate,
      })),
      total_excl_cents: report.total_excl_cents,
      total_btw_cents: report.total_btw_cents,
      total_incl_cents: report.total_incl_cents,
      paid_method: "cash",
      org_name: "Hop & Bites",
      org_kvk: "12345678",
      org_btw: "NL000000000B01",
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    // print failure is non-blocking
  })

  return { ok: true }
}

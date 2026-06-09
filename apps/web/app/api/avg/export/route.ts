import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"

// AVG Article 15 right-of-access export. Owner role only — exporting a
// customer's data is itself a sensitive action, audit-logged.
// Bewaarplicht 7-jaar (AWR art. 52 lid 1) overrides AVG erasure for
// invoiced rows; this endpoint EXPORTS in JSON but does NOT delete.
//
// Round 5 P2-Must (audit P2 item).

export const dynamic = "force-dynamic"

const QuerySchema = z.object({
  customer_email: z.string().email().max(120),
})

export async function GET(req: NextRequest) {
  await requireRole("owner")
  const claims = await requireVenue()

  const url = new URL(req.url)
  const parsed = QuerySchema.safeParse({
    customer_email: url.searchParams.get("customer_email"),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  }

  const supabase = await createClient()
  const email = parsed.data.customer_email.toLowerCase()

  const [ordersRes, paymentsRes] = await Promise.all([
    supabase
      .from("pos_orders")
      .select(
        "id, ordered_label, status, customer_name, customer_email, customer_phone, total_incl_cents, total_excl_cents, total_btw_cents, placed_at, paid_at, items:pos_order_items (name, qty, line_incl_cents, btw_class, modifiers_json)",
      )
      .eq("org_id", claims.orgId)
      .ilike("customer_email", email),
    supabase
      .from("pos_payments")
      .select("id, order_id, method, status, amount_cents, mollie_payment_id, captured_at")
      .eq("org_id", claims.orgId)
      .in(
        "order_id",
        (
          await supabase
            .from("pos_orders")
            .select("id")
            .eq("org_id", claims.orgId)
            .ilike("customer_email", email)
        ).data?.map((o) => o.id) ?? [],
      ),
  ])

  // Audit the export itself.
  await supabase.rpc("write_audit_log", {
    p_org_id: claims.orgId,
    p_venue_id: claims.venueId,
    p_actor_user_id: claims.userId,
    p_actor_terminal_id: null,
    p_event_type: "manager.override",
    p_payload: {
      action: "avg_export",
      customer_email_hash: await sha256(email),
      orders_count: ordersRes.data?.length ?? 0,
      payments_count: paymentsRes.data?.length ?? 0,
      canonical_json_version: "2026-05-18-a",
    },
  })

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),
      subject_email: email,
      data_controller: { org_id: claims.orgId },
      orders: ordersRes.data ?? [],
      payments: paymentsRes.data ?? [],
      retention_notice:
        "Rijen onder bewaarplicht (AWR art. 52 lid 1, 7 jaar) zijn opgenomen in deze export. Verwijdering is wettelijk niet toegestaan tot bewaarplicht-termijn afloopt.",
    },
    {
      status: 200,
      headers: {
        "content-disposition": `attachment; filename="avg-export-${email}.json"`,
        "cache-control": "no-store",
      },
    },
  )
}

async function sha256(s: string): Promise<string> {
  const { createHash } = await import("node:crypto")
  return createHash("sha256").update(s).digest("hex")
}

import { NextResponse, type NextRequest } from "next/server"
import { createClient as createSbAdmin } from "@supabase/supabase-js"
import { verifyHashChain } from "@/lib/dal/audit-chain"

// Pillar 2 production monitor — dagelijkse hash chain walk for every
// active org. On the Pi the pos-chain-verify.timer systemd unit pings
// this at 04:00 with `Authorization: Bearer $CRON_SECRET`. Any
// broken_at result fires a Sentry alert via the `level: "fatal"` capture.

export const dynamic = "force-dynamic"
export const maxDuration = 60

function admin() {
  return createSbAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: NextRequest) {
  // The systemd timer sends Authorization: Bearer $CRON_SECRET; without
  // CRON_SECRET configured (dev) any request is accepted.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
  }

  const supabase = admin()
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, slug")
    .eq("pos_tier", "pro")

  const results: Array<{
    org_id: string
    ok: boolean
    verified?: number
    broken_at_seq?: number
    reason?: string
  }> = []

  for (const org of (orgs ?? []) as Array<{ id: string; slug: string }>) {
    try {
      const r = await verifyHashChain({ orgId: org.id })
      if (r.ok) {
        results.push({ org_id: org.id, ok: true, verified: r.verified })
      } else {
        results.push({
          org_id: org.id,
          ok: false,
          broken_at_seq: r.broken_at_seq,
          reason: r.reason,
        })
        // Sentry alert hook lands here in prod.
        console.error(
          `[verify-chain] BROKEN org=${org.id} seq=${r.broken_at_seq} reason=${r.reason}`,
        )
      }
    } catch (err) {
      results.push({
        org_id: org.id,
        ok: false,
        reason: (err as Error).message,
      })
    }
  }

  const allOk = results.every((r) => r.ok)
  return NextResponse.json(
    { ok: allOk, results, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 500 },
  )
}

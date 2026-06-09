import { NextResponse, type NextRequest } from "next/server"
import { createClient as createSbAdmin } from "@supabase/supabase-js"

// CWV ingest endpoint. Anyone with the PWA loaded can POST a vitals
// report; we trust them only enough to aggregate p75/p95 — no PII goes
// through, just metric name + value + path.
//
// Pillar 4 monitor.

export const dynamic = "force-dynamic"

interface VitalsBody {
  name: "INP" | "LCP" | "CLS"
  value: number
  rating: "good" | "needs-improvement" | "poor"
  id: string
  delta?: number
  nav_type?: string
  path?: string
  ts?: number
}

function admin() {
  return createSbAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  let body: VitalsBody
  try {
    body = (await req.json()) as VitalsBody
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 })
  }

  if (!["INP", "LCP", "CLS"].includes(body.name)) {
    return NextResponse.json({ error: "bad_metric" }, { status: 400 })
  }

  // Best-effort write — never block the user on metrics ingestion.
  const supabase = admin()
  void supabase
    .from("cwv_metrics")
    .insert({
      name: body.name,
      value_ms: body.name === "CLS" ? Math.round(body.value * 1000) : Math.round(body.value),
      rating: body.rating,
      path: body.path?.slice(0, 120) ?? null,
      nav_type: body.nav_type?.slice(0, 32) ?? null,
    })
    .then(() => {})

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"
import { requireRole } from "@/lib/dal/auth"
import { verifyHashChain } from "@/lib/dal/audit-chain"

// Live hash-chain status for the admin badge. Manager-min. Verifies the
// latest 1000 audit_log rows for the user's org. Cached 60s.

export const dynamic = "force-dynamic"
export const revalidate = 60

export async function GET() {
  const claims = await requireRole("manager")
  try {
    const r = await verifyHashChain({ orgId: claims.orgId, limit: 1000 })
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: (err as Error).message },
      { status: 500 },
    )
  }
}

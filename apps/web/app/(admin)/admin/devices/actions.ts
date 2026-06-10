"use server"
import { z } from "zod"
import { requireRole } from "@/lib/dal/auth"

const Schema = z.object({ role: z.enum(["cashier", "manager"]) })

type Result =
  | { ok: true; code: string; expires_at: number }
  | { ok: false; error: string }

export async function issuePairCodeAction(raw: unknown): Promise<Result> {
  await requireRole("manager")
  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  const piUrl = process.env.PI_BRIDGE_URL ?? "https://hopbites.local:3001"
  const adminToken = process.env.PI_BRIDGE_ADMIN_TOKEN
  if (!adminToken) {
    return { ok: false, error: "pi_bridge_admin_token_missing" }
  }

  try {
    const res = await fetch(`${piUrl}/admin/issue-pair-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({ role: parsed.data.role }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      return { ok: false, error: `pi_${res.status}` }
    }
    const data = (await res.json()) as { code: string; expires_at: number }
    return { ok: true, code: data.code, expires_at: data.expires_at }
  } catch (err) {
    return { ok: false, error: (err as Error).message || "pi_unreachable" }
  }
}

export interface PairedTablet {
  terminal_id: string
  venue_id: string
  role: string
  paired_at: number
  last_seen_at: number | null
  jti: string
  revoked: boolean
}

export async function listTabletsAction(): Promise<
  { ok: true; tablets: PairedTablet[] } | { ok: false; error: string }
> {
  await requireRole("manager")
  const piUrl = process.env.PI_BRIDGE_URL ?? "https://hopbites.local:3001"
  const adminToken = process.env.PI_BRIDGE_ADMIN_TOKEN
  if (!adminToken) return { ok: false, error: "pi_bridge_admin_token_missing" }
  try {
    const res = await fetch(`${piUrl}/admin/tablets`, {
      headers: { "x-admin-token": adminToken },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    })
    if (!res.ok) return { ok: false, error: `pi_${res.status}` }
    const data = (await res.json()) as { tablets: PairedTablet[] }
    return { ok: true, tablets: data.tablets }
  } catch (err) {
    return { ok: false, error: (err as Error).message || "pi_unreachable" }
  }
}

const RevokeSchema = z.object({ jti: z.string().min(20) })

export async function revokeTabletAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const claims = await requireRole("manager")
  const parsed = RevokeSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }
  const piUrl = process.env.PI_BRIDGE_URL ?? "https://hopbites.local:3001"
  const adminToken = process.env.PI_BRIDGE_ADMIN_TOKEN
  if (!adminToken) return { ok: false, error: "pi_bridge_admin_token_missing" }
  try {
    const res = await fetch(`${piUrl}/admin/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({
        jti: parsed.data.jti,
        reason: `revoked via admin UI door ${claims.userId}`,
      }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return { ok: false, error: `pi_${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message || "pi_unreachable" }
  }
}

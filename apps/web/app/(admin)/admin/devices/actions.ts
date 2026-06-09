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

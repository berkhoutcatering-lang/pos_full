"use server"
import { z } from "zod"
import { createClient as createSbClient } from "@supabase/supabase-js"
import { hash as argonHash } from "@node-rs/argon2"
import { requireRole } from "@/lib/dal/auth"

const Schema = z.object({
  target_user_id: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/),
})

type Result = { ok: true } | { ok: false; error: string }

function admin() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function setManagerPinAction(raw: unknown): Promise<Result> {
  const claims = await requireRole("manager")
  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" }

  // Argon2id matches the format check on memberships.manager_pin_hash
  // (`like '$argon2id$%'`).
  const hash = await argonHash(parsed.data.pin, {
    algorithm: 2, // 2 = argon2id in @node-rs/argon2
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  })

  const supabase = admin()
  const { error } = await supabase
    .from("memberships")
    .update({ manager_pin_hash: hash })
    .eq("user_id", parsed.data.target_user_id)
    .eq("org_id", claims.orgId)
    .in("role", ["manager", "owner"])
  if (error) return { ok: false, error: "update_failed" }

  await supabase.rpc("write_audit_log", {
    p_org_id: claims.orgId,
    p_venue_id: null,
    p_actor_user_id: claims.userId,
    p_actor_terminal_id: null,
    p_event_type: "manager.override",
    p_payload: {
      action: "set_manager_pin",
      target_user_id: parsed.data.target_user_id,
    },
  })
  return { ok: true }
}

import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { StaffView } from "./staff-view"

export const dynamic = "force-dynamic"

export default async function StaffPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const supabase = await createClient()
  const { data } = await supabase
    .from("memberships")
    .select("user_id, role, created_at, manager_pin_hash")
    .eq("org_id", claims.orgId)
    .order("created_at")
  const rows = (data ?? []).map((m) => ({
    user_id: m.user_id as string,
    role: m.role as string,
    created_at: m.created_at as string,
    has_manager_pin: Boolean(m.manager_pin_hash),
  }))
  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">Personeel</h2>
      <StaffView rows={rows} />
    </section>
  )
}

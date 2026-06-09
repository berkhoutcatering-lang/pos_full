import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHead } from "@/components/admin/page-head"
import { StaffView } from "./staff-view"

export const dynamic = "force-dynamic"

export default async function StaffPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const supabase = await createClient()
  const { data } = await supabase
    .from("organization_members")
    .select("user_id, pos_role, created_at, manager_pin_hash")
    .eq("organization_id", claims.orgId)
    .eq("status", "active")
    .not("pos_role", "is", null)
    .order("created_at")
  const rows = (data ?? []).map((m) => ({
    user_id: m.user_id as string,
    role: m.pos_role as string,
    created_at: m.created_at as string,
    has_manager_pin: Boolean(m.manager_pin_hash),
  }))
  return (
    <section>
      <PageHead
        eyebrow="Beheer"
        title="Personeel"
        sub="Wie mag inloggen op kassa, keuken en beheer."
      />
      <StaffView rows={rows} />
    </section>
  )
}

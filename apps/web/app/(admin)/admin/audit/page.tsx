import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHead } from "@/components/admin/page-head"
import { AuditView } from "./audit-view"

export const dynamic = "force-dynamic"

export default async function AuditPage() {
  await requireRole("owner")
  const claims = await requireVenue()
  const supabase = await createClient()
  const { data } = await supabase
    .from("pos_audit_log")
    .select(
      "seq_id, event_type, actor_user_id, actor_terminal_id, hash_curr, created_at",
    )
    .eq("org_id", claims.orgId)
    .order("seq_id", { ascending: false })
    .limit(100)
  const rows = ((data ?? []) as Array<{
    seq_id: number
    event_type: string
    actor_user_id: string | null
    actor_terminal_id: string | null
    hash_curr: string
    created_at: string
  }>).map((e) => ({
    seq_id: e.seq_id,
    event_type: e.event_type,
    actor:
      e.actor_user_id?.slice(0, 8) ??
      e.actor_terminal_id?.slice(0, 8) ??
      "system",
    hash_curr: e.hash_curr,
    created_at: e.created_at,
  }))
  return (
    <section>
      <PageHead
        eyebrow="Beheer"
        title="Audit log"
        sub="Onveranderlijk logboek met SBA Fase 4 hash-chain — prijs-, retour- en beschikbaarheidsacties."
      />
      <AuditView rows={rows} orgId={claims.orgId} />
    </section>
  )
}

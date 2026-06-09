import { requireRole } from "@/lib/dal/auth"
import { PageHead } from "@/components/admin/page-head"
import { ChatShell } from "./chat-shell"

export const dynamic = "force-dynamic"

export default async function AdminChatPage() {
  await requireRole("manager")
  return (
    <section>
      <PageHead
        eyebrow="Beheer"
        title="AI-chat"
        sub="Stel vragen in gewone taal over deze locatie — omzet, items, open orders."
      />
      <ChatShell />
    </section>
  )
}

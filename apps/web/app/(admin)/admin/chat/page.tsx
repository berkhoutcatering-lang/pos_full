import { requireRole } from "@/lib/dal/auth"
import { ChatShell } from "./chat-shell"

export const dynamic = "force-dynamic"

export default async function AdminChatPage() {
  await requireRole("manager")
  return (
    <section className="flex h-[calc(100dvh-3rem)] flex-col">
      <h2 className="mb-3 text-2xl font-bold">AI-chat</h2>
      <p className="mb-3 text-sm opacity-70">
        Haiku 4.5 + tool-use. Vraag bv: <em>&quot;wat was de omzet gisteren&quot;</em> of{" "}
        <em>&quot;welke 5 items verkochten het beste deze week&quot;</em>.
      </p>
      <ChatShell />
    </section>
  )
}

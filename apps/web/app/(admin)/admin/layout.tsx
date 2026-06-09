import type { ReactNode } from "react"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { ConnectionChip } from "@/components/connection-chip"

// Sidebar split: "Operationeel" (Pi-bridge first, blijft tijdens outage)
// vs "Beheer" (cloud-only, voor tussen rushes).
//
// Pillar #1 Pi-Edge Cloud-Truth surface — groene bolletjes signaleren
// dat de operational items via Pi-bridge LAN beschikbaar blijven.

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  await requireRole("manager")
  const claims = await requireVenue()
  const supabase = await createClient()
  const { data: venue } = await supabase
    .from("venues")
    .select("name")
    .eq("id", claims.venueId)
    .maybeSingle()

  return (
    <div className="grid min-h-dvh grid-cols-[260px_1fr] bg-offwhite text-charcoal-800">
      <AdminSidebar />
      <main className="min-h-0 overflow-y-auto px-10 py-8">
        {/* Topline */}
        <div className="mb-7 flex items-center justify-between">
          <div className="text-[14px] font-semibold leading-none text-charcoal-500">
            {venue?.name ?? "Hop & Bites"}
          </div>
          <div className="flex items-center gap-3.5">
            <ConnectionChip onLight />
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-hop-600 text-[15px] font-bold leading-none text-white">
              {claims.role.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}

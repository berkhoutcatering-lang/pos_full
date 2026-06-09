import type { ReactNode } from "react"
import { requireAuth } from "@/lib/dal/auth"

// (pos) route group — tablet surfaces (kassa, KDS, CFD). Each route enforces
// its own role (/pos + /keuken cashier-min, /cfd viewer-min) so a venue
// account with view-only rights can drive the customer display. Pi-first;
// AI-free.

export default async function PosLayout({ children }: { children: ReactNode }) {
  await requireAuth()
  return (
    <div className="min-h-dvh bg-offwhite text-charcoal-800">
      {children}
    </div>
  )
}

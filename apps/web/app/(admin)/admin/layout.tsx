import type { ReactNode } from "react"
import Link from "next/link"
import { requireRole } from "@/lib/dal/auth"
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
  return (
    <div className="grid min-h-dvh grid-cols-[220px_1fr] bg-[var(--color-surface)] text-[var(--color-surface-fg)]">
      <aside className="border-r border-[var(--color-border)] p-4">
        <h1 className="mb-4 text-lg font-bold text-[var(--color-brand)]">
          Hop &amp; Bites
        </h1>

        <nav className="flex flex-col gap-1 text-sm">
          <NavLink href="/admin">Dashboard</NavLink>

          <NavHeader>Operationeel</NavHeader>
          <NavLink href="/admin/operational/voorraad" offlineCapable>Voorraad</NavLink>
          <NavLink href="/admin/operational/availability" offlineCapable>Beschikbaarheid</NavLink>
          <NavLink href="/admin/operational/prijs" offlineCapable>Prijs (tijdelijk)</NavLink>
          <NavLink href="/admin/operational/devices" offlineCapable>Apparaten</NavLink>
          <NavLink href="/admin/operational/dagafsluiting" offlineCapable>Dagafsluiting</NavLink>

          <NavHeader>Beheer</NavHeader>
          <NavLink href="/admin/menu">Menu</NavLink>
          <NavLink href="/admin/staff">Personeel</NavLink>
          <NavLink href="/admin/theme">Thema</NavLink>
          <NavLink href="/admin/usage">AI-gebruik</NavLink>
          <NavLink href="/admin/audit">Audit log</NavLink>
          <NavLink href="/admin/chat">AI-chat</NavLink>
        </nav>
      </aside>
      <main className="relative p-6">
        <div className="absolute right-6 top-4">
          <ConnectionChip />
        </div>
        {children}
      </main>
    </div>
  )
}

function NavHeader({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider opacity-50">
      {children}
    </div>
  )
}

function NavLink({
  href,
  children,
  offlineCapable = false,
}: {
  href: string
  children: ReactNode
  offlineCapable?: boolean
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded px-3 py-2 hover:bg-[color-mix(in_oklch,var(--color-accent)_15%,transparent)]"
    >
      <span>{children}</span>
      {offlineCapable ? (
        <span
          className="inline-block size-2 rounded-full bg-emerald-500"
          aria-label="Werkt offline via Pi-bridge"
          title="Werkt offline via Pi-bridge"
        />
      ) : null}
    </Link>
  )
}

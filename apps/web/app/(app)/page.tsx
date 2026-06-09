import { requireVenue } from "@/lib/dal/auth"

export default async function HomePage() {
  const claims = await requireVenue()
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold text-[var(--color-brand)]">POS — Hop &amp; Bites</h1>
      <p className="mt-2 text-sm">
        Ingelogd als <strong>{claims.role}</strong>, venue <code>{claims.venueId}</code>
      </p>
      <p className="mt-6 text-sm opacity-70">
        Phase 1 foundation up. Volgende fasen voegen /pos, /keuken, /cfd, /q, en /admin toe.
      </p>
    </main>
  )
}

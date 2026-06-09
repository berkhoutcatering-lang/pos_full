import { requireRole, requireVenue } from "@/lib/dal/auth"
import { computeZReport } from "@/lib/dal/dagafsluiting"

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date())
  const z = await computeZReport({
    orgId: claims.orgId,
    venueId: claims.venueId,
    date: today,
  })

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">Vandaag — {today}</h2>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Omzet incl." value={`€${(z.total_incl_cents / 100).toFixed(2)}`} />
        <Stat label="BTW" value={`€${(z.total_btw_cents / 100).toFixed(2)}`} />
        <Stat label="Orders" value={z.order_count.toString()} />
        <Stat label="Cash" value={`€${(z.payment_split.cash_cents / 100).toFixed(2)}`} />
        <Stat label="PIN" value={`€${(z.payment_split.pin_cents / 100).toFixed(2)}`} />
        <Stat label="iDEAL" value={`€${(z.payment_split.ideal_cents / 100).toFixed(2)}`} />
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-4">
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}

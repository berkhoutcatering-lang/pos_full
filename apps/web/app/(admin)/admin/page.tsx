import { Euro, Percent, Receipt, TrendingUp } from "lucide-react"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { computeZReport } from "@/lib/dal/dagafsluiting"
import { computeDashboardActivity } from "@/lib/dal/dashboard"
import { PageHead } from "@/components/admin/page-head"
import { StatCard } from "@/components/admin/stat-card"
import { euroCents } from "@/lib/format"

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date())
  const [z, activity] = await Promise.all([
    computeZReport({ orgId: claims.orgId, venueId: claims.venueId, date: today }),
    computeDashboardActivity({
      orgId: claims.orgId,
      venueId: claims.venueId,
      date: today,
    }),
  ])

  const gemCents = z.order_count > 0 ? Math.round(z.total_incl_cents / z.order_count) : 0
  const pay = [
    { label: "PIN", cents: z.payment_split.pin_cents, color: "var(--color-hop-600)" },
    { label: "Contant", cents: z.payment_split.cash_cents, color: "var(--color-charcoal-700)" },
    { label: "iDEAL", cents: z.payment_split.ideal_cents, color: "var(--color-amber-600)" },
  ].filter((p) => p.cents > 0)
  const totalPay =
    z.payment_split.pin_cents +
    z.payment_split.cash_cents +
    z.payment_split.ideal_cents +
    z.payment_split.other_cents

  const hours = activity.orders_per_hour
  const maxH = Math.max(1, ...hours)
  const nowHour = Number(
    new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  )

  const prettyDate = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date())

  return (
    <section>
      <PageHead
        eyebrow={`Vandaag · ${prettyDate}`}
        title="Dashboard"
        sub="Live omzet en activiteit van deze locatie."
      />

      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Omzet incl."
          value={euroCents(z.total_incl_cents)}
          icon={<Euro size={18} />}
          accent="var(--color-hop-600)"
        />
        <StatCard
          label="Orders"
          value={z.order_count}
          icon={<Receipt size={18} />}
          accent="var(--color-charcoal-700)"
        />
        <StatCard
          label="Gem. bon"
          value={euroCents(gemCents)}
          icon={<TrendingUp size={18} />}
          accent="var(--color-amber-600)"
        />
        <StatCard
          label="BTW"
          value={euroCents(z.total_btw_cents)}
          icon={<Percent size={18} />}
          accent="var(--color-brick-600)"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Orders per uur */}
        <div className="rounded-lg border border-line-strong bg-paper-bright p-6">
          <div className="mb-1 text-[18px] font-extrabold leading-none text-charcoal-900">
            Orders per uur
          </div>
          <div className="hb-tabular mb-6 text-[14px] font-medium leading-none text-charcoal-500">
            {activity.start_hour}:00 – {activity.start_hour + hours.length - 1}:00
          </div>
          <div className="flex h-[180px] items-end gap-2">
            {hours.map((h, i) => {
              const hour = activity.start_hour + i
              return (
                <div key={hour} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-[3px]"
                    style={{
                      height: Math.max(2, (h / maxH) * 150),
                      background:
                        hour === nowHour
                          ? "var(--color-hop-600)"
                          : "var(--color-hop-300)",
                    }}
                  />
                  <span className="hb-tabular text-[11px] font-semibold leading-none text-charcoal-500">
                    {hour}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Betaalmethoden + best verkocht */}
        <div className="rounded-lg border border-line-strong bg-paper-bright p-6">
          <div className="mb-1 text-[18px] font-extrabold leading-none text-charcoal-900">
            Betaalmethoden
          </div>
          <div className="hb-tabular mb-6 text-[14px] font-medium leading-none text-charcoal-500">
            Totaal {euroCents(totalPay)}
          </div>

          {pay.length > 0 ? (
            <>
              <div className="flex h-4 gap-0.5 overflow-hidden rounded-[3px]">
                {pay.map((p) => (
                  <div key={p.label} style={{ flex: p.cents, background: p.color }} />
                ))}
              </div>
              <div className="mt-3.5 flex gap-2.5">
                {pay.map((p) => (
                  <div key={p.label} className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center gap-[7px] text-[13px] font-bold leading-none text-charcoal-800">
                      <span
                        className="h-2.5 w-2.5 flex-none rounded-[3px]"
                        style={{ background: p.color }}
                      />
                      {p.label}
                    </div>
                    <div className="hb-tabular text-[15px] font-bold leading-none text-charcoal-900">
                      {euroCents(p.cents)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[14px] font-medium text-charcoal-500">
              Nog geen betalingen vandaag.
            </p>
          )}

          <div className="mt-7 border-t border-line pt-5">
            <div className="mb-3.5 text-[14px] font-extrabold leading-none text-charcoal-900">
              Best verkocht
            </div>
            {activity.top_items.length === 0 ? (
              <p className="text-[14px] font-medium text-charcoal-500">
                Nog geen verkopen vandaag.
              </p>
            ) : (
              activity.top_items.slice(0, 4).map((t) => (
                <div
                  key={t.name}
                  className="flex items-baseline justify-between gap-3 py-[7px]"
                >
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold leading-[1.2] text-charcoal-800">
                    <span className="hb-tabular mr-2 text-charcoal-500">{t.qty}×</span>
                    {t.name}
                  </span>
                  <span className="hb-tabular flex-none text-[14px] font-bold leading-none text-charcoal-900">
                    {euroCents(t.sum_cents)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

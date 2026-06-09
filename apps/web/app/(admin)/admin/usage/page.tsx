import { BatteryCharging, Gauge, Sparkles } from "lucide-react"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { checkCostCap } from "@/lib/ai/cost-cap"
import { createClient } from "@/lib/supabase/server"
import { PageHead } from "@/components/admin/page-head"
import { StatCard } from "@/components/admin/stat-card"

export const dynamic = "force-dynamic"

export default async function UsagePage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const cap = await checkCostCap(claims.orgId)

  const supabase = await createClient()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: byKind } = await supabase
    .from("ai_usage")
    .select("action_type, model, cost_eur_cents, tokens_input, tokens_output, created_at")
    .eq("organization_id", claims.orgId)
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(50)

  const pct = cap.cap_eur > 0 ? Math.min(150, Math.round(cap.pct * 100)) : 0

  // Per-feature aggregation for the horizontal bars.
  const perFeature = new Map<string, number>()
  for (const r of byKind ?? []) {
    perFeature.set(
      r.action_type as string,
      (perFeature.get(r.action_type as string) ?? 0) + 1,
    )
  }
  const features = Array.from(perFeature.entries())
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n)
  const maxN = Math.max(1, ...features.map((f) => f.n))
  const FEATURE_COLORS = [
    "var(--color-hop-600)",
    "var(--color-amber-600)",
    "var(--color-charcoal-700)",
    "var(--color-brick-600)",
  ]

  return (
    <section>
      <PageHead
        eyebrow="Beheer"
        title="AI-gebruik"
        sub={`Verbruik van de AI-assistent deze maand. Tier: ${cap.tier} — soft cap €${cap.cap_eur.toFixed(2)}, hard cap €${(cap.cap_eur * 1.5).toFixed(2)}.`}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <StatCard
          label="Verbruikt"
          value={`€ ${cap.used_eur.toFixed(2)}`}
          icon={<Sparkles size={18} />}
          accent="var(--color-hop-600)"
        />
        <StatCard
          label="Soft cap"
          value={`€ ${cap.cap_eur.toFixed(2)}`}
          icon={<Gauge size={18} />}
          accent="var(--color-charcoal-700)"
        />
        <StatCard
          label="Resterend"
          value={`€ ${Math.max(0, cap.cap_eur - cap.used_eur).toFixed(2)}`}
          icon={<BatteryCharging size={18} />}
          accent="var(--color-amber-600)"
        />
      </div>

      {/* Month progress */}
      <div className="mb-4 rounded-lg border border-line-strong bg-paper-bright p-6">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[18px] font-extrabold leading-none text-charcoal-900">
            Maandverbruik
          </span>
          <span className="hb-tabular text-[16px] font-bold leading-none text-charcoal-500">
            {pct}%
          </span>
        </div>
        <div className="h-4 overflow-hidden rounded-full border border-line bg-paper">
          <div
            className="h-full"
            style={{
              width: `${Math.min(100, (pct / 1.5))}%`,
              background:
                pct > 85 ? "var(--color-brick-600)" : "var(--color-hop-600)",
            }}
          />
        </div>
        {cap.hard_cap_reached ? (
          <p className="mt-3 text-[14px] font-semibold text-brick-600">
            Hard cap bereikt — AI uitgeschakeld tot eind van de maand.
          </p>
        ) : cap.soft_cap_reached ? (
          <p className="mt-3 text-[14px] font-semibold text-amber-600">
            Boven soft cap — AI blijft beschikbaar, overweeg een upgrade.
          </p>
        ) : null}
      </div>

      {/* Per feature */}
      <div className="mb-4 rounded-lg border border-line-strong bg-paper-bright p-6">
        <div className="mb-5 text-[18px] font-extrabold leading-none text-charcoal-900">
          Per functie
        </div>
        {features.length === 0 ? (
          <p className="text-[14px] font-medium text-charcoal-500">
            Nog geen AI-gebruik deze maand.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {features.map((f, i) => (
              <div key={f.label}>
                <div className="mb-[7px] flex justify-between">
                  <span className="text-[15px] font-semibold leading-none text-charcoal-800">
                    {f.label}
                  </span>
                  <span className="hb-tabular text-[15px] font-bold leading-none text-charcoal-900">
                    {f.n}×
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full"
                    style={{
                      width: `${(f.n / maxN) * 100}%`,
                      background: FEATURE_COLORS[i % FEATURE_COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent calls */}
      <div className="overflow-hidden rounded-lg border border-line-strong bg-paper-bright">
        <div className="border-b border-line px-5 py-3 text-[12px] font-bold uppercase leading-none tracking-[0.06em] text-charcoal-500">
          Laatste calls
        </div>
        {(byKind ?? []).map((r, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <span className="hb-tabular min-w-[140px] text-[13px] font-semibold leading-none text-charcoal-500">
              {new Date(r.created_at).toLocaleString("nl-NL", {
                timeZone: "Europe/Amsterdam",
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="flex-1 text-[14px] font-bold leading-none text-charcoal-900">
              {r.action_type}
            </span>
            <span className="hidden font-mono text-[12px] text-charcoal-500 md:block">
              {r.model}
            </span>
            <span className="hb-tabular text-[13px] font-medium leading-none text-charcoal-500">
              {r.tokens_input} in · {r.tokens_output} uit
            </span>
            <span className="hb-tabular min-w-[80px] text-right text-[14px] font-bold leading-none text-charcoal-900">
              € {(Number(r.cost_eur_cents) / 100).toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

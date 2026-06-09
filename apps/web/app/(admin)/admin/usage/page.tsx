import { requireRole, requireVenue } from "@/lib/dal/auth"
import { checkCostCap } from "@/lib/ai/cost-cap"
import { createClient } from "@/lib/supabase/server"

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
    .select("kind, model_id, cost_eur, input_tokens, output_tokens, created_at")
    .eq("org_id", claims.orgId)
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(50)

  const pct = cap.cap_eur > 0 ? Math.min(150, Math.round(cap.pct * 100)) : 0
  const barColor = cap.hard_cap_reached
    ? "bg-red-600"
    : cap.soft_cap_reached
      ? "bg-amber-500"
      : "bg-emerald-500"

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">AI-gebruik deze maand</h2>
      <p className="mb-3 text-sm opacity-70">
        Tier: <strong>{cap.tier}</strong> — soft cap €{cap.cap_eur.toFixed(2)},
        hard cap €{(cap.cap_eur * 1.5).toFixed(2)}.
      </p>
      <div className="mb-4 h-4 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
        <div className={`h-full ${barColor}`} style={{ width: `${(pct / 1.5).toFixed(0)}%` }} />
      </div>
      <p className="mb-6 text-lg">
        Gebruikt: <strong>€{cap.used_eur.toFixed(4)}</strong> ({pct}%)
        {cap.hard_cap_reached
          ? " — AI uitgeschakeld tot eind van de maand."
          : cap.soft_cap_reached
            ? " — boven soft cap, AI blijft beschikbaar maar overweeg upgrade."
            : ""}
      </p>

      <h3 className="mb-2 text-lg font-semibold">Laatste calls</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left">
            <th className="py-2">Wanneer</th>
            <th>Kind</th>
            <th>Model</th>
            <th>Input</th>
            <th>Output</th>
            <th>Kosten</th>
          </tr>
        </thead>
        <tbody>
          {(byKind ?? []).map((r, i) => (
            <tr key={i} className="border-b border-[var(--color-border)]">
              <td className="py-2">
                {new Date(r.created_at).toLocaleString("nl-NL", {
                  timeZone: "Europe/Amsterdam",
                })}
              </td>
              <td>{r.kind}</td>
              <td className="font-mono text-xs">{r.model_id}</td>
              <td>{r.input_tokens}</td>
              <td>{r.output_tokens}</td>
              <td>€{Number(r.cost_eur).toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

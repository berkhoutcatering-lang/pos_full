// Static kassa mockup for the /admin/theme live-preview iframe. Reads the
// theme preset from the `?theme=…` query and applies it via the
// `data-theme` attribute on an outer div so its CSS-custom-properties
// cascade overrides the parent layout's tokens within this subtree.
//
// Pillar #5 White-Label SaaS-Ready: tenant logo + brand-color binnen 60s
// zonder code-deploy.
//
// No auth, no DB - pure presentational so a manager can A/B presets
// without affecting real data.

import { PRESETS, type Preset } from "@/lib/dal/theme"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{ theme?: string; brand?: string }>
}

const SAMPLE_ITEMS = [
  { name: "Broodje Pulled Pork", price: 950 },
  { name: "Broodje Brisket", price: 1095 },
  { name: "Frietjes", price: 450 },
  { name: "Coca-Cola", price: 300 },
  { name: "Heineken", price: 450 },
  { name: "Statiegeld beker", price: 25 },
]

export default async function PreviewPosPage({ searchParams }: PageProps) {
  const { theme, brand } = await searchParams
  const preset: Preset = (PRESETS as readonly string[]).includes(theme ?? "")
    ? (theme as Preset)
    : "hopbites"
  const brandName = brand?.trim() || "Hop & Bites"

  const total = SAMPLE_ITEMS.reduce((s, it) => s + it.price, 0)

  return (
    <div
      data-theme={preset}
      className="flex min-h-dvh flex-col bg-[var(--color-surface)] text-[var(--color-surface-fg)]"
    >
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <h1 className="text-sm font-semibold opacity-80">
          {brandName} — kassa preview
        </h1>
        <span className="inline-flex h-9 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 px-3 text-xs text-emerald-800">
          ● live
        </span>
      </header>
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        {["broodjes", "sides", "frisdrank", "bier", "alcohol", "statiegeld"].map(
          (c, i) => (
            <span
              key={c}
              className={`min-h-[44px] whitespace-nowrap rounded-full px-4 text-sm font-medium capitalize ${
                i === 0
                  ? "bg-[var(--color-brand)] text-white"
                  : "bg-[color-mix(in_oklch,var(--color-accent)_15%,transparent)]"
              } inline-flex items-center`}
            >
              {c}
            </span>
          ),
        )}
      </div>
      <div className="grid flex-1 grid-cols-3 gap-3 overflow-auto p-3">
        {SAMPLE_ITEMS.map((it) => (
          <div
            key={it.name}
            className="flex min-h-[88px] flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left"
          >
            <span className="font-medium leading-tight">{it.name}</span>
            <span className="text-sm font-semibold">
              €{(it.price / 100).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="m-3 min-h-[88px] rounded-xl bg-[var(--color-brand)] p-4 text-xl font-semibold text-white shadow-lg"
      >
        Bekijk bestelling — 6 items — €{(total / 100).toFixed(2)}
      </button>
    </div>
  )
}

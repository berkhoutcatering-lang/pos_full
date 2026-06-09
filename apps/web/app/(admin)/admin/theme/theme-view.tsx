"use client"
import { useState } from "react"
import { Check } from "lucide-react"
import { saveThemeAction } from "./actions"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"

// Accent swatch per preset — the preview re-tints with this color.
const PRESET_META: Record<string, { label: string; accent: string }> = {
  hopbites: { label: "Hop-groen", accent: "var(--color-hop-600)" },
  autumn: { label: "BBQ-brick", accent: "var(--color-brick-600)" },
  "warm-grey": { label: "Ember-amber", accent: "var(--color-amber-600)" },
  neutral: { label: "Antraciet", accent: "var(--color-charcoal-800)" },
  blueprint: { label: "Blueprint", accent: "#3B5E8C" },
  midnight: { label: "Midnight", accent: "#4C466E" },
  spring: { label: "Lente-groen", accent: "var(--color-hop-500)" },
  festival: { label: "Festival", accent: "#A8527E" },
}

export function ThemeView({
  current,
  presets,
}: {
  current: { preset: string; brand_name: string; brand_logo_url: string | null }
  presets: string[]
}) {
  const [preset, setPreset] = useState(current.preset)
  const [brandName, setBrandName] = useState(current.brand_name)
  const [logoUrl, setLogoUrl] = useState(current.brand_logo_url ?? "")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const accent = PRESET_META[preset]?.accent ?? "var(--color-hop-600)"

  const handleSave = async () => {
    setBusy(true)
    setMsg(null)
    const res = await saveThemeAction({
      preset,
      brand_name: brandName,
      brand_logo_url: logoUrl || null,
    })
    setBusy(false)
    setMsg(res.ok ? "Opgeslagen — herlaad om de wijziging te zien." : `Fout: ${res.error}`)
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* Accent picker + brand */}
      <div className="rounded-lg border border-line-strong bg-paper-bright p-6">
        <div className="mb-[18px] text-[18px] font-extrabold leading-none text-charcoal-900">
          Accentkleur
        </div>
        <div className="flex flex-col gap-2.5">
          {presets.map((p) => {
            const meta = PRESET_META[p] ?? { label: p, accent: "var(--color-hop-600)" }
            const active = preset === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={cn(
                  "flex items-center gap-3.5 rounded-md border px-3.5 py-3 text-left transition-[border-color,background] duration-[var(--dur-fast)]",
                  active ? "bg-paper" : "border-line-strong bg-paper-bright hover:bg-paper"
                )}
                style={active ? { borderColor: meta.accent } : undefined}
              >
                <span
                  className="h-9 w-9 flex-none rounded-md"
                  style={{ background: meta.accent }}
                />
                <span className="flex-1 text-[16px] font-bold leading-none text-charcoal-900">
                  {meta.label}
                </span>
                {active ? <Check size={20} style={{ color: meta.accent }} /> : null}
              </button>
            )
          })}
        </div>

        <div className="mb-3.5 mt-7 text-[18px] font-extrabold leading-none text-charcoal-900">
          Merk
        </div>
        <label className="mb-3.5 block">
          <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
            Merknaam
          </span>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            maxLength={80}
            className="h-12 w-full rounded-md border border-line-strong bg-paper-bright px-3.5 text-[16px] font-semibold text-charcoal-900 outline-none"
          />
        </label>
        <label className="mb-5 block">
          <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
            Logo URL (optioneel)
          </span>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            maxLength={2048}
            placeholder="https://…"
            className="h-12 w-full rounded-md border border-line-strong bg-paper-bright px-3.5 text-[15px] font-medium text-charcoal-900 outline-none placeholder:text-charcoal-400"
          />
        </label>

        <Button variant="primary" icon={<Check size={18} />} onClick={handleSave} disabled={busy}>
          {busy ? "Bezig…" : "Opslaan"}
        </Button>
        {msg ? (
          <p className="mt-3 text-[14px] font-semibold text-charcoal-800">{msg}</p>
        ) : null}
      </div>

      {/* Live klantscherm preview — re-tints with the chosen accent */}
      <div className="rounded-lg border border-line-strong bg-paper-bright p-6">
        <div className="mb-4 text-[12px] font-bold uppercase leading-none tracking-[0.1em] text-charcoal-500">
          Preview · klantscherm
        </div>
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between bg-charcoal-900 px-5 py-4">
            <span className="text-[20px] font-extrabold leading-none text-white">
              {brandName.includes("&") ? (
                <>
                  {brandName.split("&")[0]}
                  <span style={{ color: accent }}>&amp;</span>
                  {brandName.split("&").slice(1).join("&")}
                </>
              ) : (
                brandName
              )}
            </span>
            <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.16em] text-charcoal-400">
              Live
            </span>
          </div>
          <div className="flex flex-col gap-3 bg-charcoal-800 p-6">
            <div className="text-[22px] font-extrabold leading-none" style={{ color: accent }}>
              Klaar — kom afhalen!
            </div>
            <div
              className="hb-tabular rounded-lg p-5 text-center text-[34px] font-black leading-none text-white"
              style={{ background: accent }}
            >
              #214
            </div>
          </div>
        </div>
        <button
          type="button"
          className="mt-[18px] h-14 w-full rounded-md border-none text-[18px] font-extrabold leading-none text-white"
          style={{ background: accent }}
        >
          Afrekenen — voorbeeldknop
        </button>
      </div>
    </div>
  )
}

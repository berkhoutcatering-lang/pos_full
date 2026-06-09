"use client"
import { useState } from "react"
import { saveThemeAction } from "./actions"

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

  const previewSrc = `/preview/pos?theme=${encodeURIComponent(preset)}&brand=${encodeURIComponent(brandName)}`

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            data-theme={p}
            className={`min-h-[88px] rounded-xl border-2 p-3 text-left transition-colors ${
              p === preset
                ? "border-[var(--color-brand)]"
                : "border-[var(--color-border)]"
            }`}
            style={{
              background: "var(--color-surface)",
              color: "var(--color-surface-fg)",
            }}
          >
            <span
              className="block h-3 w-full rounded"
              style={{ background: "var(--color-brand)" }}
            />
            <span className="mt-2 block font-medium capitalize">{p}</span>
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-sm">Merknaam</span>
        <input
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          maxLength={80}
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
        />
      </label>
      <label className="block">
        <span className="text-sm">Logo URL (optioneel)</span>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          maxLength={2048}
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
        />
      </label>

      <button
        onClick={handleSave}
        disabled={busy}
        className="rounded bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Bezig…" : "Opslaan"}
      </button>
      {msg ? <p className="text-sm">{msg}</p> : null}
      </div>

      {/* Live preview iframe — re-mounts when preset/brandName change */}
      <div className="sticky top-6 h-[calc(100dvh-6rem)] overflow-hidden rounded-xl border border-[var(--color-border)] shadow-sm">
        <iframe
          key={previewSrc}
          src={previewSrc}
          title="Kassa preview"
          className="block h-full w-full bg-[var(--color-surface)]"
        />
      </div>
    </div>
  )
}

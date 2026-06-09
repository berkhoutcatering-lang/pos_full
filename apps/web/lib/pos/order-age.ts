// KDS color-aging windows. Foodtruck rush is fast — green<3min, amber<6min,
// red>=6min. Tweak per venue once Sam has real data.

export type AgeBucket = "fresh" | "warming" | "stale"

const THRESHOLDS_MS = {
  warming: 3 * 60_000,
  stale: 6 * 60_000,
}

export function ageOf(placedAtIso: string, now = Date.now()): AgeBucket {
  const age = now - new Date(placedAtIso).getTime()
  if (age >= THRESHOLDS_MS.stale) return "stale"
  if (age >= THRESHOLDS_MS.warming) return "warming"
  return "fresh"
}

export const AGE_CLASSES: Record<AgeBucket, string> = {
  fresh: "border-emerald-500/60 bg-emerald-50",
  warming: "border-amber-500/70 bg-amber-50",
  stale: "border-red-600 bg-red-50 ring-2 ring-red-300 animate-pulse",
}

export function formatAge(placedAtIso: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(placedAtIso).getTime())
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`
}

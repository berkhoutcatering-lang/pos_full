// KDS color-aging windows (design system): hop <4min, amber <8min,
// brick >=8min.

export type AgeBucket = "fresh" | "warming" | "stale"

const THRESHOLDS_MS = {
  warming: 4 * 60_000,
  stale: 8 * 60_000,
}

export function ageOf(placedAtIso: string, now = Date.now()): AgeBucket {
  const age = now - new Date(placedAtIso).getTime()
  if (age >= THRESHOLDS_MS.stale) return "stale"
  if (age >= THRESHOLDS_MS.warming) return "warming"
  return "fresh"
}

/** Age-chip text color per bucket (H&B tokens). */
export const AGE_TEXT_CLASSES: Record<AgeBucket, string> = {
  fresh: "text-hop-600",
  warming: "text-amber-600",
  stale: "text-brick-600",
}

/** Legacy card classes — kept for callers that still tint whole cards. */
export const AGE_CLASSES: Record<AgeBucket, string> = {
  fresh: "border-hop-300 bg-hop-50",
  warming: "border-amber-600/70 bg-amber-100",
  stale: "border-brick-600 bg-brick-100 animate-pulse motion-reduce:animate-none",
}

export function formatAge(placedAtIso: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(placedAtIso).getTime())
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return m < 1 ? `${s}s` : `${m}m`
}

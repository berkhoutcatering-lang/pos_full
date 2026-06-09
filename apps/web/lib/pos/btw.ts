import type { BtwClass } from "./types"

/**
 * BTW_RULES_2026 — authoritative NL BTW mapping for the POS. NEVER inferred
 * at runtime; the menu editor sets a class per item and this module turns
 * that class into a rate. Cocktails are 21%, alcoholvrij bier <=0.5% is 9%,
 * energy drinks are 21% (sinds 2024).
 */
export const BTW_RULES_2026 = {
  food_9: 9,
  nonalc_beer_9: 9,
  alcohol_21: 21,
  soda_21: 21,
  deposit_0: 0,
  service_0: 0,
} as const satisfies Record<BtwClass, number>

export function btwRateFor(klass: BtwClass): number {
  return BTW_RULES_2026[klass]
}

export const BTW_CLASS_LABEL: Record<BtwClass, string> = {
  food_9: "Eten / frisdrank 9%",
  nonalc_beer_9: "Alcoholvrij bier 9%",
  alcohol_21: "Alcohol 21%",
  soda_21: "Energy / hoog tarief 21%",
  deposit_0: "Statiegeld 0%",
  service_0: "Service / fooi 0%",
}

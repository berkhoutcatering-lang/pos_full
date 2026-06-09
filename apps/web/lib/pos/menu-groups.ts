import type { MenuItem } from "./types"

// Two-axis kassa navigation: GROUPS (vertical rail) → CATEGORIES
// (horizontal bar) → products. Categories are free-form strings from the
// DB, so we classify them heuristically into the three fixed rail groups
// and give each a stable accent from the H&B palette.

export type GroupId = "eten" | "drinken" | "extra"

export interface MenuGroup {
  id: GroupId
  label: string
  categories: string[]
}

const DRINK_PATTERNS =
  /(drink|drank|fris|bier|beer|alcohol|wijn|cocktail|energy|koffie|coffee|thee|tea|warm|water|sap|juice|soda)/i
const EXTRA_PATTERNS =
  /(extra|topping|saus|sauzen|sauce|statiegeld|deposit|service|fooi|overig)/i

export function groupForCategory(category: string): GroupId {
  if (DRINK_PATTERNS.test(category)) return "drinken"
  if (EXTRA_PATTERNS.test(category)) return "extra"
  return "eten"
}

const GROUP_LABELS: Record<GroupId, string> = {
  eten: "Eten",
  drinken: "Drinken",
  extra: "Extra's",
}

// Fixed accent per known category; unknown categories cycle the palette.
const CATEGORY_ACCENTS: Record<string, string> = {
  broodjes: "var(--color-brick-600)",
  langos: "var(--color-brick-600)",
  sides: "var(--color-amber-600)",
  sauzen: "var(--color-hop-600)",
  frisdrank: "var(--color-charcoal-500)",
  fris: "var(--color-charcoal-500)",
  bier: "var(--color-hop-700)",
  alcohol: "var(--color-brick-700)",
  energy: "var(--color-amber-600)",
  warm: "var(--color-brick-700)",
  statiegeld: "var(--color-charcoal-500)",
  service: "var(--color-hop-700)",
  extra: "var(--color-hop-700)",
}

const ACCENT_CYCLE = [
  "var(--color-brick-600)",
  "var(--color-amber-600)",
  "var(--color-hop-600)",
  "var(--color-charcoal-500)",
  "var(--color-hop-700)",
  "var(--color-brick-700)",
]

export function accentForCategory(category: string, index: number): string {
  return (
    CATEGORY_ACCENTS[category.toLowerCase()] ??
    ACCENT_CYCLE[Math.abs(index) % ACCENT_CYCLE.length] ??
    "var(--color-hop-600)"
  )
}

/** Human label: capitalize the raw DB category. */
export function labelForCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

/** Build the rail groups from the live menu, preserving menu sort order.
 *  Only groups that actually have categories are returned. */
export function buildMenuGroups(items: MenuItem[]): MenuGroup[] {
  const categories = Array.from(new Set(items.map((i) => i.category)))
  const byGroup: Record<GroupId, string[]> = { eten: [], drinken: [], extra: [] }
  for (const c of categories) byGroup[groupForCategory(c)].push(c)
  return (Object.keys(byGroup) as GroupId[])
    .filter((g) => byGroup[g].length > 0)
    .map((g) => ({ id: g, label: GROUP_LABELS[g], categories: byGroup[g] }))
}

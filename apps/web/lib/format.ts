/** "€ 9,50" — nl-NL money formatting, always two decimals. */
export function euro(n: number): string {
  return (
    "€ " +
    n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  )
}

/** Cents → "€ 9,50". The app stores all money as integer cents. */
export function euroCents(cents: number): string {
  return euro(cents / 100)
}

// Cash helpers — NL 5-cent rounding (1 + 2-cent coins are no longer minted).

export function roundToFiveCent(cents: number): number {
  return Math.round(cents / 5) * 5
}

export function computeCashChange(args: {
  total_incl_cents: number
  given_cents: number
  round_to_five_cent?: boolean
}): { rounded_total_cents: number; change_cents: number } {
  const rounded = args.round_to_five_cent ? roundToFiveCent(args.total_incl_cents) : args.total_incl_cents
  const change = args.given_cents - rounded
  if (change < 0) {
    throw new Error("insufficient_cash")
  }
  return { rounded_total_cents: rounded, change_cents: change }
}

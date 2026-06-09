"use client"
import { useMemo, useState } from "react"
import type { PricedCart } from "@/lib/pos/types"
import { computeCashChange, roundToFiveCent } from "@/lib/pos/cash"

export function CheckoutCash({
  priced,
  busy,
  onPay,
  onBack,
}: {
  priced: PricedCart
  busy: boolean
  onPay: () => void
  onBack: () => void
}) {
  const [given, setGiven] = useState<string>("")
  const rounded = roundToFiveCent(priced.total_incl_cents)
  const givenCents = Math.round(Number(given.replace(",", ".")) * 100) || 0
  const calc = useMemo(() => {
    try {
      return computeCashChange({
        total_incl_cents: priced.total_incl_cents,
        given_cents: givenCents,
        round_to_five_cent: true,
      })
    } catch {
      return null
    }
  }, [priced.total_incl_cents, givenCents])

  const quick = [
    rounded,
    roundToFiveCent(rounded + 500),
    roundToFiveCent(rounded + 1000),
    roundToFiveCent(rounded + 2000),
  ]

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Contant betalen</h2>
        <button onClick={onBack} className="text-sm opacity-70 underline">
          Terug
        </button>
      </div>
      <p className="mb-3 text-sm">
        Totaal{" "}
        <strong>€{(priced.total_incl_cents / 100).toFixed(2)}</strong> — afgerond op
        5 cent: <strong>€{(rounded / 100).toFixed(2)}</strong>
      </p>

      <label className="mb-2 block text-sm">
        Ontvangen
        <input
          inputMode="decimal"
          value={given}
          onChange={(e) => setGiven(e.target.value)}
          placeholder="0,00"
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-right text-2xl font-semibold"
        />
      </label>

      <div className="mb-4 grid grid-cols-4 gap-2">
        {quick.map((q) => (
          <button
            key={q}
            onClick={() => setGiven((q / 100).toFixed(2))}
            className="min-h-[56px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-base"
          >
            €{(q / 100).toFixed(2)}
          </button>
        ))}
      </div>

      <p className="mb-4 text-lg">
        Wisselgeld:{" "}
        <strong>
          {calc ? `€${(calc.change_cents / 100).toFixed(2)}` : "—"}
        </strong>
      </p>

      <button
        disabled={busy || !calc}
        onClick={onPay}
        className="min-h-[72px] w-full rounded-xl bg-[var(--color-brand)] p-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Bezig…" : "Bevestig contante betaling"}
      </button>
    </>
  )
}

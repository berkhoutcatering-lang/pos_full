"use client"
import { useMemo, useState } from "react"
import type { PricedCart } from "@/lib/pos/types"
import { computeCashChange, roundToFiveCent } from "@/lib/pos/cash"
import { Button } from "@/components/ui/button"
import { euroCents } from "@/lib/format"

export function CheckoutCash({
  priced,
  busy,
  error,
  onPay,
  onBack,
}: {
  priced: PricedCart
  busy: boolean
  error: string | null
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
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <span className="text-[20px] font-semibold leading-none text-charcoal-500">
          Te betalen{" "}
          <span className="hb-tabular text-[14px]">
            (afgerond {euroCents(rounded)})
          </span>
        </span>
        <span className="hb-tabular text-[40px] font-extrabold leading-none text-charcoal-900">
          {euroCents(priced.total_incl_cents)}
        </span>
      </div>

      <label className="mb-3 block">
        <span className="mb-2 block text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
          Ontvangen
        </span>
        <input
          inputMode="decimal"
          value={given}
          onChange={(e) => setGiven(e.target.value)}
          placeholder="0,00"
          className="hb-tabular h-[60px] w-full rounded-md border border-line-strong bg-paper-bright px-[18px] text-right text-[30px] font-bold text-charcoal-900 outline-none placeholder:text-charcoal-300"
        />
      </label>

      <div className="mb-5 grid grid-cols-4 gap-2.5">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setGiven((q / 100).toFixed(2).replace(".", ","))}
            className="hb-tabular min-h-14 rounded-md border border-line-strong bg-paper-bright px-2 text-[18px] font-bold text-charcoal-900 transition-[background] duration-[var(--dur-fast)] hover:bg-offwhite"
          >
            {euroCents(q)}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-baseline justify-between border-t border-line pt-4">
        <span className="text-[20px] font-bold leading-none text-charcoal-900">
          Wisselgeld
        </span>
        <span className="hb-tabular text-[36px] font-extrabold leading-none text-hop-700">
          {calc ? euroCents(calc.change_cents) : "—"}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-brick-100 px-4 py-3 text-[15px] font-semibold text-brick-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button variant="secondary" size="lg" onClick={onBack} className="flex-none">
          Terug
        </Button>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={busy || !calc}
          onClick={onPay}
          data-testid="cash-confirm"
        >
          {busy ? "Bezig…" : "Bevestig contante betaling"}
        </Button>
      </div>
    </div>
  )
}

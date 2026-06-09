"use client"
import { useState } from "react"
import type { CartAction, CartState } from "@/lib/pos/cart-reducer"
import type { PricedCart } from "@/lib/pos/types"
import { CartItemRow } from "./cart-item-row"

// Cart-only review drawer. Payment is NOT handled here — tapping
// "Afrekenen" hands off to the non-modal PaymentDock (see payment-dock.tsx)
// so the product grid stays live while the customer pays.
export function CartDrawer({
  open,
  onClose,
  cart,
  priced,
  dispatch,
  onCheckout,
}: {
  open: boolean
  onClose: () => void
  cart: CartState
  priced: PricedCart
  dispatch: React.Dispatch<CartAction>
  onCheckout: () => void
}) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bestelling"
      className="fixed inset-0 z-40 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-auto rounded-t-2xl bg-[var(--color-surface)] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Bestelling</h2>
          <button onClick={onClose} className="text-sm opacity-70 underline">
            Sluit
          </button>
        </div>

        <input
          value={cart.customer_name ?? ""}
          onChange={(e) => dispatch({ type: "set_customer", name: e.target.value })}
          placeholder="Klantnaam (optioneel, bv. Jan)"
          maxLength={64}
          className="mb-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
        />

        <div className="max-h-[55dvh] space-y-2 overflow-auto">
          {priced.items.length === 0 ? (
            <p className="p-4 text-sm opacity-70">Voeg producten toe om te beginnen.</p>
          ) : (
            priced.items.map((it) => (
              <CartItemRow key={it.cart_line_id} item={it} dispatch={dispatch} />
            ))
          )}
        </div>

        <div className="mt-4 space-y-1 border-t border-[var(--color-border)] pt-4">
          <Row label="Subtotaal" cents={priced.subtotal_cents} />
          {priced.discount_cents > 0 ? (
            <Row
              label="Korting"
              cents={-priced.discount_cents}
              className="text-emerald-700"
            />
          ) : null}
          <BtwBreakdown priced={priced} />
          <button
            disabled={priced.items.length === 0}
            onClick={() => {
              onClose()
              onCheckout()
            }}
            className="mt-3 min-h-[64px] w-full rounded-xl bg-[var(--color-brand)] p-3 text-lg font-semibold text-white disabled:opacity-40"
          >
            Afrekenen
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  cents,
  className,
}: {
  label: string
  cents: number
  className?: string
}) {
  return (
    <div className={`flex justify-between ${className ?? ""}`}>
      <span>{label}</span>
      <span>€{(cents / 100).toFixed(2)}</span>
    </div>
  )
}

const BTW_LABELS: Record<string, { label: string; rate: number }> = {
  food_9: { label: "Eten / frisdrank", rate: 9 },
  nonalc_beer_9: { label: "Alcoholvrij bier", rate: 9 },
  alcohol_21: { label: "Alcohol", rate: 21 },
  soda_21: { label: "Hoog tarief", rate: 21 },
  deposit_0: { label: "Statiegeld", rate: 0 },
  service_0: { label: "Service / fooi", rate: 0 },
}

function BtwBreakdown({ priced }: { priced: PricedCart }) {
  const [open, setOpen] = useState(false)
  const classes = Object.entries(priced.btw_breakdown).filter(([, b]) => b.incl > 0)
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg bg-[color-mix(in_oklch,var(--color-accent)_8%,transparent)] p-2"
    >
      <summary className="flex cursor-pointer items-center justify-between text-lg font-bold">
        <span>Totaal {open ? "▾" : "▸"}</span>
        <span>€{(priced.total_incl_cents / 100).toFixed(2)}</span>
      </summary>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left opacity-70">
            <th className="py-1">BTW-klasse</th>
            <th>Tarief</th>
            <th className="text-right">Excl.</th>
            <th className="text-right">BTW</th>
            <th className="text-right">Incl.</th>
          </tr>
        </thead>
        <tbody>
          {classes.map(([cls, b]) => {
            const meta = BTW_LABELS[cls] ?? { label: cls, rate: 0 }
            return (
              <tr key={cls} className="border-t border-[var(--color-border)]">
                <td className="py-1">{meta.label}</td>
                <td>{meta.rate}%</td>
                <td className="text-right">€{(b.excl / 100).toFixed(2)}</td>
                <td className="text-right">€{(b.btw / 100).toFixed(2)}</td>
                <td className="text-right">€{(b.incl / 100).toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </details>
  )
}

"use client"

import { Clock, Receipt, Trash2, UtensilsCrossed } from "lucide-react"
import type { CartAction } from "@/lib/pos/cart-reducer"
import type { PricedCart, PricedCartLine } from "@/lib/pos/types"
import { Badge } from "@/components/ui/badge"
import { OrderLine } from "@/components/ui/order-line"
import { QtyStepper } from "@/components/ui/qty-stepper"
import { euroCents } from "@/lib/format"
import { cn } from "@/lib/cn"

function lineNote(l: PricedCartLine): string | null {
  const parts = l.selected_modifiers.map((m) => `+ ${m.name}`)
  if (l.note) parts.push(`„${l.note}"`)
  return parts.length ? parts.join(" · ") : null
}

export function ReceiptPanel({
  priced,
  dispatch,
  selectedId,
  onSelect,
  discountPct,
  holdCount,
}: {
  priced: PricedCart
  dispatch: React.Dispatch<CartAction>
  selectedId: string | null
  onSelect: (id: string | null) => void
  discountPct: number
  holdCount: number
}) {
  const count = priced.items.reduce((s, l) => s + l.qty, 0)
  const selected = priced.items.find((l) => l.cart_line_id === selectedId)

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line-strong bg-paper">
      {/* Header */}
      <div className="flex flex-none items-center justify-between border-b border-line px-[18px] py-3.5">
        <div className="flex items-center gap-2.5">
          <Receipt size={22} className="text-charcoal-700" />
          <span className="text-[20px] font-extrabold leading-none text-charcoal-900">
            Bestelling
          </span>
        </div>
        <Badge variant={count ? "accent" : "neutral"}>
          {count} {count === 1 ? "item" : "items"}
        </Badge>
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {priced.items.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2.5 text-charcoal-500">
            <UtensilsCrossed size={36} className="text-charcoal-300" />
            <span className="text-center text-[16px] font-semibold leading-[1.4]">
              Nog niets aangeslagen.
              <br />
              Tik rechts op een product.
            </span>
          </div>
        ) : (
          priced.items.map((l) => (
            <OrderLine
              key={l.cart_line_id}
              qty={l.qty}
              name={l.menu_item.name}
              unitPrice={
                (l.unit_price_cents + l.modifier_total_cents / l.qty) / 100
              }
              lineTotal={l.line_incl_cents / 100}
              note={lineNote(l)}
              selected={l.cart_line_id === selectedId}
              onClick={() =>
                onSelect(l.cart_line_id === selectedId ? null : l.cart_line_id)
              }
            />
          ))
        )}
      </div>

      {/* Selected-line action bar */}
      {selected ? (
        <div className="flex flex-none items-center gap-2.5 border-t border-hop-100 bg-hop-50 px-4 py-2.5">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-bold leading-[1.2] text-hop-800">
            {selected.menu_item.name}
          </span>
          <QtyStepper
            value={selected.qty}
            min={1}
            size="sm"
            onChange={(q) =>
              dispatch({
                type: "update_qty",
                cart_line_id: selected.cart_line_id,
                qty: q,
              })
            }
          />
          <button
            type="button"
            aria-label="Verwijder regel"
            onClick={() => {
              dispatch({ type: "remove", cart_line_id: selected.cart_line_id })
              onSelect(null)
            }}
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-md border border-brick-600 bg-paper-bright text-brick-600 transition-[background] duration-[var(--dur-fast)] hover:bg-brick-100"
          >
            <Trash2 size={20} />
          </button>
        </div>
      ) : null}

      {/* Totals */}
      <div className="flex flex-none flex-col gap-2 border-t border-line-strong px-[18px] py-3.5">
        <TotalRow label="Subtotaal" value={euroCents(priced.subtotal_cents)} />
        {priced.discount_cents > 0 ? (
          <TotalRow
            label={discountPct > 0 ? `Korting (${discountPct}%)` : "Korting"}
            value={"− " + euroCents(priced.discount_cents)}
            amber
          />
        ) : null}
        <div className="my-0.5 h-px bg-line" />
        <div className="flex items-baseline justify-between">
          <span className="text-[30px] font-extrabold leading-none text-charcoal-900">
            Totaal
          </span>
          <span className="hb-tabular text-[36px] font-extrabold leading-none text-charcoal-900">
            {euroCents(priced.total_incl_cents)}
          </span>
        </div>
        <div className="-mt-0.5 flex items-center justify-between">
          <span className="hb-tabular text-[12px] font-medium leading-none text-charcoal-500">
            incl. {euroCents(priced.total_btw_cents)} btw
          </span>
          {holdCount > 0 ? (
            <span className="hb-tabular inline-flex items-center gap-1.5 text-[12px] font-semibold leading-none text-charcoal-500">
              <Clock size={14} /> {holdCount} in de wacht
            </span>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

function TotalRow({
  label,
  value,
  amber = false,
}: {
  label: string
  value: string
  amber?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span
        className={cn(
          "text-[16px] font-medium leading-none",
          amber ? "text-amber-600" : "text-charcoal-500"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "hb-tabular text-[17px] font-bold leading-none",
          amber ? "text-amber-600" : "text-charcoal-900"
        )}
      >
        {value}
      </span>
    </div>
  )
}

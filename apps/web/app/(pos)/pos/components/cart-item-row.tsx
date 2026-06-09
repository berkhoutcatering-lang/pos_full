"use client"
import type { CartAction } from "@/lib/pos/cart-reducer"
import type { PricedCartLine } from "@/lib/pos/types"

export function CartItemRow({
  item,
  dispatch,
}: {
  item: PricedCartLine
  dispatch: React.Dispatch<CartAction>
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.menu_item.name}</div>
        {item.selected_modifiers.length > 0 ? (
          <ul className="text-xs opacity-80">
            {item.selected_modifiers.map((m) => (
              <li key={m.id}>
                + {m.name}
                {m.surcharge_cents > 0
                  ? ` (€${(m.surcharge_cents / 100).toFixed(2)})`
                  : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {item.note ? (
          <div className="text-xs italic opacity-80">! {item.note}</div>
        ) : null}
        {item.line_discount_cents > 0 ? (
          <div className="text-xs text-emerald-700">
            Korting −€{(item.line_discount_cents / 100).toFixed(2)}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            dispatch({
              type: "update_qty",
              cart_line_id: item.cart_line_id,
              qty: item.qty - 1,
            })
          }
          className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--color-border)] text-xl"
          aria-label="Minder"
        >
          −
        </button>
        <span className="min-w-[2ch] text-center font-semibold">{item.qty}</span>
        <button
          onClick={() =>
            dispatch({
              type: "update_qty",
              cart_line_id: item.cart_line_id,
              qty: item.qty + 1,
            })
          }
          className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--color-border)] text-xl"
          aria-label="Meer"
        >
          +
        </button>
        <span className="ml-2 min-w-[5ch] text-right font-semibold">
          €{(item.line_incl_cents / 100).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

"use client"
import { useEffect, useState } from "react"
import { Clock } from "lucide-react"
import type { ActiveOrder } from "@/lib/dal/active-orders"
import { AGE_TEXT_CLASSES, ageOf, formatAge } from "@/lib/pos/order-age"
import { cn } from "@/lib/cn"

/** KDS order card: white, hairline border, 6px left stripe + full-width
 *  bump button in the column's status color. Ages live (1s tick). */
export function OrderCard({
  order,
  onBump,
  nextLabel,
  nextIcon,
  accent,
}: {
  order: ActiveOrder
  onBump: () => void
  nextLabel: string
  nextIcon?: React.ReactNode
  /** Column status color (CSS value) for stripe + bump button. */
  accent: string
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const bucket = ageOf(order.placed_at, now)
  const ageText = formatAge(order.placed_at, now)

  return (
    <article
      className="flex flex-col overflow-hidden rounded-lg border border-line-strong bg-paper-bright"
      style={{ borderLeft: `6px solid ${accent}` }}
      data-test="order-card"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          <span className="hb-tabular text-[24px] font-extrabold leading-none text-charcoal-900">
            {order.ordered_label ?? "#"}
          </span>
          {order.customer_name ? (
            <span className="text-[15px] font-semibold leading-none text-charcoal-500">
              {order.customer_name}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "hb-tabular inline-flex items-center gap-1.5 text-[16px] font-extrabold leading-none",
            AGE_TEXT_CLASSES[bucket]
          )}
        >
          <Clock size={15} /> {ageText}
        </span>
      </header>

      <div className="flex flex-col gap-2.5 px-4 py-3">
        {order.items.map((it) => {
          const mods = Array.isArray(it.modifiers_json)
            ? (it.modifiers_json as Array<{ name: string }>)
            : []
          return (
            <div key={it.id} className="flex items-start gap-2.5">
              <span className="hb-tabular min-w-7 flex-none text-[18px] font-extrabold leading-[1.25] text-hop-700">
                {it.qty}×
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[18px] font-bold leading-[1.25] text-charcoal-900">
                  {it.name}
                </div>
                {mods.length > 0 ? (
                  <div className="mt-1 text-[14px] font-semibold leading-[1.3] text-charcoal-500">
                    + {mods.map((m) => m.name).join(", ")}
                  </div>
                ) : null}
                {it.notes ? (
                  <div className="mt-1 text-[14px] font-semibold italic leading-[1.3] text-charcoal-500">
                    ! {it.notes}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onBump}
        className="m-3 mt-1 flex h-16 items-center justify-center gap-2.5 rounded-md text-[18px] font-extrabold leading-none text-white transition-transform duration-[var(--dur-fast)] active:scale-[0.98]"
        style={{ background: accent }}
      >
        {nextIcon} {nextLabel}
      </button>
    </article>
  )
}

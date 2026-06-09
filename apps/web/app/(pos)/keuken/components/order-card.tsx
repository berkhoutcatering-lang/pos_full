"use client"
import { useEffect, useState } from "react"
import type { ActiveOrder } from "@/lib/dal/active-orders"
import { AGE_CLASSES, ageOf, formatAge } from "@/lib/pos/order-age"

export function OrderCard({
  order,
  onBump,
  nextLabel,
}: {
  order: ActiveOrder
  onBump: () => void
  nextLabel: string
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
      className={`flex flex-col gap-2 rounded-xl border-2 p-3 text-[var(--color-surface-fg)] ${AGE_CLASSES[bucket]}`}
      data-test="order-card"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold">{order.ordered_label ?? "#"}</h3>
        <span className="text-sm tabular-nums">{ageText}</span>
      </header>
      {order.customer_name ? (
        <p className="text-sm font-medium">Klant {order.customer_name}</p>
      ) : null}
      <ul className="text-sm">
        {order.items.map((it) => {
          const mods = Array.isArray(it.modifiers_json)
            ? (it.modifiers_json as Array<{ name: string }>)
            : []
          return (
            <li key={it.id} className="mb-1">
              <span className="font-semibold">{it.qty}×</span> {it.name}
              {mods.length > 0 ? (
                <ul className="ml-5 list-disc text-xs opacity-80">
                  {mods.map((m, i) => (
                    <li key={i}>{m.name}</li>
                  ))}
                </ul>
              ) : null}
              {it.notes ? (
                <p className="ml-5 text-xs italic opacity-80">! {it.notes}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
      <button
        onClick={onBump}
        className="mt-1 min-h-[88px] rounded-xl bg-[var(--color-brand)] text-lg font-semibold text-white active:scale-[0.98]"
      >
        {nextLabel}
      </button>
    </article>
  )
}

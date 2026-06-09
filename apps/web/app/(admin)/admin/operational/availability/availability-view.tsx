"use client"
import { useEffect, useState, useTransition } from "react"
import { supabase } from "@/lib/supabase/client"
import type { OperationalItem } from "@/lib/dal/operational-items"
import { toggleAvailabilityAction } from "@/lib/dal/admin-operational"

export function AvailabilityView({
  initial,
  orgId,
  venueId,
}: {
  initial: OperationalItem[]
  orgId: string
  venueId: string
}) {
  const [items, setItems] = useState<OperationalItem[]>(initial)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const ch = supabase
      .channel(`org:${orgId}:venue:${venueId}:availability`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pos_menu_items",
          filter: `venue_id=eq.${venueId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            is_available_override: boolean | null
            stock_qty: number | null
          }
          setItems((prev) =>
            prev.map((it) =>
              it.id === row.id
                ? { ...it, is_available_override: row.is_available_override, stock_qty: row.stock_qty }
                : it,
            ),
          )
        },
      )
      .subscribe()
    return () => {
      void ch.unsubscribe()
    }
  }, [orgId, venueId])

  const toggle = (item: OperationalItem) => {
    if (pending) return
    // Cycle: null → false → null
    const next = item.is_available_override === false ? null : false
    startTransition(async () => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, is_available_override: next } : it,
        ),
      )
      const res = await toggleAvailabilityAction({ item_id: item.id, available: next })
      if (res.ok && res.data) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, is_available_override: res.data!.is_available_override }
              : it,
          ),
        )
      }
    })
  }

  const resetAll = () => {
    startTransition(async () => {
      for (const it of items) {
        if (it.is_available_override === false) {
          await toggleAvailabilityAction({ item_id: it.id, available: null })
        }
      }
      setItems((prev) => prev.map((it) => ({ ...it, is_available_override: null })))
    })
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm opacity-60">
          {items.filter((i) => i.is_available_override === false).length}× uitgezet,{" "}
          {items.filter((i) => i.stock_qty === 0).length}× op.
        </p>
        <button
          onClick={resetAll}
          disabled={pending}
          className="rounded border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[color-mix(in_oklch,var(--color-accent)_15%,transparent)]"
        >
          Alles weer aan
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((it) => {
          const isOut = it.stock_qty !== null && it.stock_qty <= 0
          const isManagerOff = it.is_available_override === false
          const cls = isOut
            ? "border-red-500 bg-red-50"
            : isManagerOff
              ? "border-amber-500 bg-amber-50"
              : "border-[var(--color-border)] bg-[var(--color-surface)]"
          return (
            <button
              key={it.id}
              onClick={() => toggle(it)}
              className={`relative flex min-h-[88px] flex-col justify-between rounded-xl border-2 p-3 text-left ${cls}`}
              data-testid="availability-card"
            >
              <span className="line-clamp-2 font-medium leading-tight">{it.name}</span>
              <span className="text-sm font-semibold">
                €{(it.effective_price_cents / 100).toFixed(2)}
              </span>
              {isOut ? (
                <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  OP
                </span>
              ) : isManagerOff ? (
                <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  UIT
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </>
  )
}

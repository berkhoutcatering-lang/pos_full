"use client"
import { useEffect, useOptimistic, useState, useTransition } from "react"
import { supabase } from "@/lib/supabase/client"
import type { OperationalItem } from "@/lib/dal/operational-items"
import { updateStockAction } from "@/lib/dal/admin-operational"

interface OptimisticPatch {
  item_id: string
  stock_qty: number | null
}

export function VoorraadView({
  initial,
  orgId,
  venueId,
}: {
  initial: OperationalItem[]
  orgId: string
  venueId: string
}) {
  const [items, setItems] = useState<OperationalItem[]>(initial)
  const [optimistic, applyOptimistic] = useOptimistic<OperationalItem[], OptimisticPatch>(
    items,
    (state, patch) =>
      state.map((it) =>
        it.id === patch.item_id ? { ...it, stock_qty: patch.stock_qty } : it,
      ),
  )
  const [pending, startTransition] = useTransition()

  // Realtime: collega zet stock bij → dit scherm volgt mee.
  useEffect(() => {
    const ch = supabase
      .channel(`org:${orgId}:venue:${venueId}:menu`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pos_menu_items",
          filter: `venue_id=eq.${venueId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; stock_qty: number | null }
          setItems((prev) =>
            prev.map((it) => (it.id === row.id ? { ...it, stock_qty: row.stock_qty } : it)),
          )
        },
      )
      .subscribe()
    return () => {
      void ch.unsubscribe()
    }
  }, [orgId, venueId])

  const bump = (item: OperationalItem, delta: number) => {
    if (pending) return
    const cur = item.stock_qty ?? 0
    const next = Math.max(0, cur + delta)
    startTransition(async () => {
      applyOptimistic({ item_id: item.id, stock_qty: next })
      const res = await updateStockAction({ item_id: item.id, delta })
      if (res.ok && res.data) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, stock_qty: res.data!.stock_qty } : it,
          ),
        )
      }
    })
  }

  const setExact = (item: OperationalItem, set_to: number | null) => {
    if (pending) return
    startTransition(async () => {
      applyOptimistic({ item_id: item.id, stock_qty: set_to })
      const res = await updateStockAction({ item_id: item.id, set_to })
      if (res.ok && res.data) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, stock_qty: res.data!.stock_qty } : it,
          ),
        )
      }
    })
  }

  // Group by category for the operator-first layout.
  const byCategory = optimistic.reduce<Record<string, OperationalItem[]>>((acc, it) => {
    ;(acc[it.category] ??= []).push(it)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(byCategory).map(([cat, list]) => (
        <section key={cat}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-70">
            {cat}
          </h3>
          <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
            {list.map((it) => (
              <li key={it.id} className="flex items-center justify-between p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.name}</div>
                  <div className="text-xs opacity-60">
                    {it.stock_qty === null ? (
                      "ongelimiteerd"
                    ) : it.stock_qty === 0 ? (
                      <span className="font-semibold text-red-700">OP</span>
                    ) : (
                      `${it.stock_qty} voorraad`
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => bump(it, -10)}
                    className="min-h-[44px] min-w-[56px] rounded-full bg-[var(--color-border)] text-base"
                  >
                    −10
                  </button>
                  <button
                    onClick={() => bump(it, -5)}
                    className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--color-border)] text-base"
                  >
                    −5
                  </button>
                  <button
                    onClick={() => bump(it, -1)}
                    className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--color-border)] text-base"
                  >
                    −1
                  </button>
                  <span className="min-w-[3ch] text-center font-semibold tabular-nums">
                    {it.stock_qty === null ? "∞" : it.stock_qty}
                  </span>
                  <button
                    onClick={() => bump(it, 1)}
                    className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--color-border)] text-base"
                  >
                    +1
                  </button>
                  <button
                    onClick={() => bump(it, 5)}
                    className="min-h-[44px] min-w-[44px] rounded-full bg-[var(--color-border)] text-base"
                  >
                    +5
                  </button>
                  <button
                    onClick={() => setExact(it, 0)}
                    className="min-h-[44px] rounded-full bg-red-100 px-3 text-sm font-semibold text-red-800"
                  >
                    OP
                  </button>
                  <button
                    onClick={() => setExact(it, null)}
                    className="min-h-[44px] rounded-full bg-emerald-100 px-3 text-sm font-semibold text-emerald-800"
                    title="Ongelimiteerd"
                  >
                    ∞
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

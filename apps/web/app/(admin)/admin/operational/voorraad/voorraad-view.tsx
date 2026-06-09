"use client"
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react"
import { AlertTriangle, Layers, XCircle } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import type { OperationalItem } from "@/lib/dal/operational-items"
import { updateStockAction } from "@/lib/dal/admin-operational"
import { accentForCategory, labelForCategory } from "@/lib/pos/menu-groups"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/admin/stat-card"
import { cn } from "@/lib/cn"

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

  const byCategory = useMemo(
    () =>
      optimistic.reduce<Record<string, OperationalItem[]>>((acc, it) => {
        ;(acc[it.category] ??= []).push(it)
        return acc
      }, {}),
    [optimistic],
  )
  const categories = Object.keys(byCategory)

  const tracked = optimistic.filter((i) => i.stock_qty !== null)
  const lowCount = tracked.filter((i) => i.stock_qty! > 0 && i.stock_qty! <= 5).length
  const outCount = tracked.filter((i) => i.stock_qty! <= 0).length

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <StatCard
          label="Items laag"
          value={lowCount}
          icon={<AlertTriangle size={18} />}
          accent="var(--color-amber-600)"
        />
        <StatCard
          label="Uitverkocht"
          value={outCount}
          icon={<XCircle size={18} />}
          accent="var(--color-brick-600)"
        />
        <StatCard
          label="Categorieën"
          value={categories.length}
          icon={<Layers size={18} />}
          accent="var(--color-charcoal-700)"
        />
      </div>

      <div className="flex flex-col gap-6">
        {categories.map((cat) => (
          <section key={cat}>
            <div className="mb-3 flex items-center gap-2.5">
              <span
                className="h-3 w-3 rounded-[3px]"
                style={{ background: accentForCategory(cat, categories.indexOf(cat)) }}
              />
              <span className="text-[17px] font-extrabold leading-none text-charcoal-900">
                {labelForCategory(cat)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {byCategory[cat]!.map((it) => {
                const n = it.stock_qty
                const status =
                  n === null
                    ? null
                    : n <= 0
                      ? { v: "danger" as const, t: "Uitverkocht" }
                      : n <= 5
                        ? { v: "amber" as const, t: "Bijna op" }
                        : null
                return (
                  <div
                    key={it.id}
                    className="flex items-center gap-3.5 rounded-lg border border-line-strong bg-paper-bright px-[18px] py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-bold leading-[1.2] text-charcoal-900">
                        {it.name}
                      </div>
                      {status ? (
                        <div className="mt-1.5">
                          <Badge variant={status.v} size="sm">
                            {status.t}
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <StepBtn onClick={() => bump(it, -5)} small>
                        −5
                      </StepBtn>
                      <StepBtn onClick={() => bump(it, -1)}>−</StepBtn>
                      <span
                        className={cn(
                          "hb-tabular min-w-11 text-center text-[24px] font-extrabold leading-none",
                          n !== null && n <= 0 ? "text-brick-600" : "text-charcoal-900"
                        )}
                      >
                        {n === null ? "∞" : n}
                      </span>
                      <StepBtn onClick={() => bump(it, 1)}>+</StepBtn>
                      <StepBtn onClick={() => bump(it, 5)} small>
                        +5
                      </StepBtn>
                      <StepBtn onClick={() => setExact(it, 0)} danger small>
                        OP
                      </StepBtn>
                      <StepBtn onClick={() => setExact(it, null)} small title="Ongelimiteerd">
                        ∞
                      </StepBtn>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function StepBtn({
  children,
  onClick,
  small = false,
  danger = false,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  small?: boolean
  danger?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "h-11 flex-none rounded-md border text-center leading-none transition-[background] duration-[var(--dur-fast)] active:scale-[0.97]",
        small ? "w-11 text-[15px] font-bold" : "w-11 text-[22px] font-bold",
        danger
          ? "border-brick-600 bg-paper-bright text-brick-600 hover:bg-brick-100"
          : "border-line-strong bg-paper text-charcoal-800 hover:bg-offwhite"
      )}
    >
      {children}
    </button>
  )
}

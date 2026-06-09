"use client"
import { useEffect, useMemo, useState, useTransition } from "react"
import { supabase } from "@/lib/supabase/client"
import type { OperationalItem } from "@/lib/dal/operational-items"
import { toggleAvailabilityAction } from "@/lib/dal/admin-operational"
import { accentForCategory, labelForCategory } from "@/lib/pos/menu-groups"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/admin/toggle"
import { euroCents } from "@/lib/format"
import { cn } from "@/lib/cn"

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

  const byCategory = useMemo(
    () =>
      items.reduce<Record<string, OperationalItem[]>>((acc, it) => {
        ;(acc[it.category] ??= []).push(it)
        return acc
      }, {}),
    [items],
  )
  const categories = Object.keys(byCategory)
  const offCount = items.filter((i) => i.is_available_override === false).length
  const outCount = items.filter((i) => i.stock_qty !== null && i.stock_qty <= 0).length

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="hb-tabular text-[14px] font-semibold leading-none text-charcoal-500">
          {offCount}× uitgezet · {outCount}× op
        </p>
        <Button variant="secondary" size="sm" onClick={resetAll} disabled={pending}>
          Alles weer aan
        </Button>
      </div>

      <div className="flex flex-col gap-7">
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
            <div className="overflow-hidden rounded-lg border border-line-strong bg-paper-bright">
              {byCategory[cat]!.map((it, i) => {
                const isOut = it.stock_qty !== null && it.stock_qty <= 0
                const isOn = it.is_available_override !== false
                return (
                  <div
                    key={it.id}
                    data-testid="availability-card"
                    className={cn(
                      "flex items-center gap-4 px-5 py-3.5",
                      i > 0 && "border-t border-line",
                      (!isOn || isOut) && "opacity-55"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-bold leading-none text-charcoal-900">
                        {it.name}
                      </div>
                      {it.stock_qty !== null ? (
                        <div className="hb-tabular mt-1 text-[13px] font-medium leading-none text-charcoal-500">
                          {it.stock_qty} op voorraad
                        </div>
                      ) : null}
                    </div>
                    {isOut ? (
                      <Badge variant="danger" size="sm">
                        Uitverkocht
                      </Badge>
                    ) : !isOn ? (
                      <Badge variant="amber" size="sm">
                        Uit
                      </Badge>
                    ) : null}
                    <span className="hb-tabular min-w-[78px] text-right text-[16px] font-bold leading-none text-charcoal-900">
                      {euroCents(it.effective_price_cents)}
                    </span>
                    <Toggle
                      on={isOn}
                      onChange={() => toggle(it)}
                      label={`${it.name} ${isOn ? "uitzetten" : "aanzetten"}`}
                      disabled={pending}
                    />
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

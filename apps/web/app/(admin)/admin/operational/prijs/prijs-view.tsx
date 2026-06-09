"use client"
import { useState, useTransition } from "react"
import { Beer } from "lucide-react"
import type { OperationalItem } from "@/lib/dal/operational-items"
import { setPriceOverrideAction } from "@/lib/dal/admin-operational"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/admin/toggle"
import { euroCents } from "@/lib/format"
import { cn } from "@/lib/cn"

function endOfTodayISO(): string {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

const HAPPY_HOUR_RE = /bier|alcohol/i
const HAPPY_HOUR_PCT = 0.8 // −20%

export function PrijsView({
  initial,
  orgId: _orgId,
  venueId: _venueId,
}: {
  initial: OperationalItem[]
  orgId: string
  venueId: string
}) {
  const [items, setItems] = useState<OperationalItem[]>(initial)
  const [editing, setEditing] = useState<string | null>(null)
  const [override, setOverride] = useState<string>("")
  const [expires, setExpires] = useState<string>(endOfTodayISO().slice(0, 16))
  const [pending, startTransition] = useTransition()

  const beerItems = items.filter((i) => HAPPY_HOUR_RE.test(i.category))
  const happyActive =
    beerItems.length > 0 && beerItems.every((i) => i.price_override_cents !== null)
  const activeOverrides = items.filter((i) => i.price_override_cents !== null)

  const patch = (id: string, p: Partial<OperationalItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)))

  const applyOverride = async (item: OperationalItem, cents: number | null, expiresAt: string | null) => {
    const res = await setPriceOverrideAction({
      item_id: item.id,
      price_cents: cents,
      expires_at: expiresAt,
    })
    if (res.ok) {
      patch(item.id, {
        effective_price_cents:
          cents === null ? item.base_price_cents : (res.data?.price_override_cents ?? cents),
        price_override_cents: cents === null ? null : (res.data?.price_override_cents ?? cents),
        price_override_expires_at: cents === null ? null : (res.data?.price_override_expires_at ?? expiresAt),
      })
    }
  }

  const toggleHappyHour = () => {
    if (pending || beerItems.length === 0) return
    startTransition(async () => {
      if (happyActive) {
        for (const it of beerItems) await applyOverride(it, null, null)
      } else {
        const exp = endOfTodayISO()
        for (const it of beerItems) {
          await applyOverride(it, Math.round(it.base_price_cents * HAPPY_HOUR_PCT), exp)
        }
      }
    })
  }

  const save = (item: OperationalItem) => {
    const cents = Math.round(Number(override.replace(",", ".")) * 100)
    if (!Number.isFinite(cents) || cents < 0) return
    startTransition(async () => {
      await applyOverride(item, cents, new Date(expires).toISOString())
      setEditing(null)
      setOverride("")
    })
  }

  const clear = (item: OperationalItem) => {
    startTransition(async () => {
      await applyOverride(item, null, null)
    })
  }

  const clearAll = () => {
    startTransition(async () => {
      for (const it of activeOverrides) await applyOverride(it, null, null)
    })
  }

  return (
    <div>
      {/* Happy hour + overrides stat */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className={cn(
            "rounded-lg border p-6 transition-[background,border-color] duration-[var(--dur-base)]",
            happyActive ? "border-amber-600 bg-amber-100" : "border-line-strong bg-paper-bright"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Beer size={22} className="text-amber-600" />
              <span className="text-[18px] font-extrabold leading-none text-charcoal-900">
                Happy hour — bier
              </span>
            </div>
            <Toggle
              on={happyActive}
              onChange={toggleHappyHour}
              accent="var(--color-amber-600)"
              label="Happy hour aan/uit"
              disabled={pending || beerItems.length === 0}
            />
          </div>
          <p className="text-[14px] font-medium leading-[1.4] text-charcoal-500">
            −20% op alle bier · tot einde van vandaag.{" "}
            {happyActive ? "Actief — verschijnt nu op de kassa." : "Uit."}
          </p>
        </div>

        <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-line-strong bg-paper-bright p-6">
          <div className="text-[13px] font-bold uppercase leading-none tracking-[0.06em] text-charcoal-500">
            Actieve overrides
          </div>
          <div className="hb-tabular text-[32px] font-extrabold leading-none text-charcoal-900">
            {activeOverrides.length}
          </div>
          {activeOverrides.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              disabled={pending}
              className="self-start text-[13px] font-semibold leading-none text-brick-600 underline-offset-2 hover:underline"
            >
              Alle overrides verwijderen
            </button>
          ) : (
            <div className="text-[13px] font-medium leading-none text-charcoal-500">
              Geen tijdelijke prijzen actief
            </div>
          )}
        </div>
      </div>

      {/* Price table */}
      <div className="overflow-hidden rounded-lg border border-line-strong bg-paper-bright">
        <div className="flex items-center gap-4 px-5 py-3 text-[12px] font-bold uppercase leading-none tracking-[0.06em] text-charcoal-500">
          <span className="flex-1">Item</span>
          <span>Basis</span>
          <span className="min-w-[80px] text-right">Tijdelijk</span>
          <span className="min-w-[140px]" />
        </div>
        {items.map((it) => {
          const hasOverride = it.price_override_cents !== null
          return (
            <div key={it.id} className="border-t border-line">
              <div className="flex items-center gap-4 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-bold leading-none text-charcoal-900">
                    {it.name}
                  </span>
                  {hasOverride && it.price_override_expires_at ? (
                    <span className="hb-tabular mt-1 block text-[12px] font-medium leading-none text-charcoal-500">
                      vervalt{" "}
                      {new Date(it.price_override_expires_at).toLocaleString("nl-NL", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "hb-tabular text-[15px] leading-none",
                    hasOverride
                      ? "font-semibold text-charcoal-500 line-through"
                      : "font-semibold text-charcoal-900"
                  )}
                >
                  {euroCents(it.base_price_cents)}
                </span>
                <span className="hb-tabular min-w-[80px] text-right text-[16px] font-extrabold leading-none">
                  {hasOverride ? (
                    <span className="text-amber-600">
                      {euroCents(it.price_override_cents!)}
                    </span>
                  ) : (
                    <span className="text-[13px] font-semibold text-charcoal-500">—</span>
                  )}
                </span>
                <span className="flex min-w-[140px] justify-end gap-2">
                  {hasOverride ? (
                    <Button variant="danger" size="sm" onClick={() => clear(it)} disabled={pending}>
                      Reset
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditing(it.id)
                      setOverride((it.base_price_cents / 100).toFixed(2).replace(".", ","))
                    }}
                  >
                    Wijzig
                  </Button>
                </span>
              </div>

              {editing === it.id ? (
                <div className="flex flex-wrap items-end gap-3 border-t border-line bg-paper px-5 py-4">
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
                      Nieuwe prijs (€)
                    </span>
                    <input
                      inputMode="decimal"
                      value={override}
                      onChange={(e) => setOverride(e.target.value)}
                      className="hb-tabular h-12 w-32 rounded-md border border-line-strong bg-paper-bright px-3 text-right text-[18px] font-bold text-charcoal-900 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
                      Vervalt op
                    </span>
                    <input
                      type="datetime-local"
                      value={expires}
                      onChange={(e) => setExpires(e.target.value)}
                      className="hb-tabular h-12 rounded-md border border-line-strong bg-paper-bright px-3 text-[15px] font-semibold text-charcoal-900 outline-none"
                    />
                  </label>
                  <Button variant="primary" onClick={() => save(it)} disabled={pending}>
                    Opslaan
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(null)
                      setOverride("")
                    }}
                  >
                    Annuleer
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

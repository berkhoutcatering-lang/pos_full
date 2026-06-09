"use client"
import { useState, useTransition } from "react"
import type { OperationalItem } from "@/lib/dal/operational-items"
import { setPriceOverrideAction } from "@/lib/dal/admin-operational"

function endOfTodayISO(): string {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

export function PrijsView({
  initial,
  orgId,
  venueId,
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

  const save = (item: OperationalItem) => {
    const cents = Math.round(Number(override.replace(",", ".")) * 100)
    if (!Number.isFinite(cents) || cents < 0) return
    startTransition(async () => {
      const res = await setPriceOverrideAction({
        item_id: item.id,
        price_cents: cents,
        expires_at: new Date(expires).toISOString(),
      })
      if (res.ok && res.data) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  effective_price_cents: res.data!.price_override_cents ?? it.base_price_cents,
                  price_override_cents: res.data!.price_override_cents,
                  price_override_expires_at: res.data!.price_override_expires_at,
                }
              : it,
          ),
        )
        setEditing(null)
        setOverride("")
      }
    })
  }

  const clear = (item: OperationalItem) => {
    startTransition(async () => {
      const res = await setPriceOverrideAction({
        item_id: item.id,
        price_cents: null,
        expires_at: null,
      })
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  effective_price_cents: it.base_price_cents,
                  price_override_cents: null,
                  price_override_expires_at: null,
                }
              : it,
          ),
        )
      }
    })
  }

  const clearAll = () => {
    startTransition(async () => {
      for (const it of items.filter((i) => i.price_override_cents !== null)) {
        await setPriceOverrideAction({
          item_id: it.id,
          price_cents: null,
          expires_at: null,
        })
      }
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          effective_price_cents: it.base_price_cents,
          price_override_cents: null,
          price_override_expires_at: null,
        })),
      )
    })
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm opacity-60">
          {items.filter((i) => i.price_override_cents !== null).length} actieve overrides
        </p>
        <button
          onClick={clearAll}
          disabled={pending}
          className="rounded border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[color-mix(in_oklch,var(--color-accent)_15%,transparent)]"
        >
          Alle overrides verwijderen
        </button>
      </div>

      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        {items.map((it) => {
          const hasOverride = it.price_override_cents !== null
          return (
            <li key={it.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.name}</div>
                  <div className="text-xs opacity-60">
                    Basisprijs €{(it.base_price_cents / 100).toFixed(2)}
                    {hasOverride ? (
                      <>
                        {" · "}
                        <span className="font-semibold text-emerald-700">
                          Override €{(it.price_override_cents! / 100).toFixed(2)}
                        </span>
                        {it.price_override_expires_at ? (
                          <>
                            {" · vervalt "}
                            {new Date(it.price_override_expires_at).toLocaleString(
                              "nl-NL",
                              { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" },
                            )}
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  {hasOverride ? (
                    <button
                      onClick={() => clear(it)}
                      disabled={pending}
                      className="rounded bg-red-100 px-3 py-2 text-sm text-red-800"
                    >
                      Reset
                    </button>
                  ) : null}
                  <button
                    onClick={() => {
                      setEditing(it.id)
                      setOverride((it.base_price_cents / 100).toFixed(2))
                    }}
                    className="rounded bg-[var(--color-brand)] px-3 py-2 text-sm font-semibold text-white"
                  >
                    Wijzig
                  </button>
                </div>
              </div>

              {editing === it.id ? (
                <div className="mt-3 flex items-end gap-2 border-t border-[var(--color-border)] pt-3">
                  <label className="text-sm">
                    Nieuwe prijs (€)
                    <input
                      inputMode="decimal"
                      value={override}
                      onChange={(e) => setOverride(e.target.value)}
                      className="mt-1 w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-right font-semibold"
                    />
                  </label>
                  <label className="text-sm">
                    Vervalt op
                    <input
                      type="datetime-local"
                      value={expires}
                      onChange={(e) => setExpires(e.target.value)}
                      className="mt-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                    />
                  </label>
                  <button
                    onClick={() => save(it)}
                    disabled={pending}
                    className="rounded bg-[var(--color-brand)] px-4 py-2 font-semibold text-white"
                  >
                    Opslaan
                  </button>
                  <button
                    onClick={() => {
                      setEditing(null)
                      setOverride("")
                    }}
                    className="rounded px-2 text-sm opacity-70 underline"
                  >
                    Annuleer
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}

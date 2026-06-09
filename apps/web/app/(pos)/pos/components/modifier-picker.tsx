"use client"
import { useState } from "react"
import type { MenuItem, ModifierGroup, ModifierOption } from "@/lib/pos/types"

export function ModifierPicker({
  item,
  groups,
  onConfirm,
  onCancel,
}: {
  item: MenuItem
  groups: ModifierGroup[]
  onConfirm: (
    modifiers: ModifierOption[],
    qty: number,
    note: string | undefined,
  ) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Record<string, ModifierOption[]>>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState("")

  const toggle = (group: ModifierGroup, opt: ModifierOption) => {
    setSelected((cur) => {
      const list = cur[group.id] ?? []
      const has = list.some((m) => m.id === opt.id)
      if (has) return { ...cur, [group.id]: list.filter((m) => m.id !== opt.id) }
      if (list.length >= group.max_select) {
        // Replace oldest when at cap (radio-like UX for max_select=1)
        return { ...cur, [group.id]: [...list.slice(1), opt] }
      }
      return { ...cur, [group.id]: [...list, opt] }
    })
  }

  const allMinsMet = groups.every(
    (g) => (selected[g.id]?.length ?? 0) >= g.min_select,
  )

  const flatModifiers: ModifierOption[] = Object.values(selected).flat()

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-auto rounded-t-2xl bg-[var(--color-surface)] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{item.name}</h2>
          <button onClick={onCancel} className="text-sm opacity-70 underline">
            Annuleer
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="opacity-70">Geen opties — direct toevoegen.</p>
        ) : (
          groups.map((g) => {
            const list = selected[g.id] ?? []
            return (
              <fieldset key={g.id} className="mb-4">
                <legend className="mb-2 text-base font-medium">
                  {g.name}
                  {g.min_select > 0 ? (
                    <span className="ml-2 text-xs text-red-700">
                      verplicht (min {g.min_select})
                    </span>
                  ) : null}
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {g.options.map((opt) => {
                    const on = list.some((m) => m.id === opt.id)
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggle(g, opt)}
                        className={`min-h-[64px] rounded-lg border p-3 text-left text-base ${
                          on
                            ? "border-[var(--color-brand)] bg-[color-mix(in_oklch,var(--color-brand)_15%,transparent)]"
                            : "border-[var(--color-border)] bg-[var(--color-surface)]"
                        }`}
                      >
                        <div className="font-medium">{opt.name}</div>
                        {opt.surcharge_cents > 0 ? (
                          <div className="text-xs opacity-70">
                            +€{(opt.surcharge_cents / 100).toFixed(2)}
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )
          })
        )}

        <label className="mb-3 block text-sm">
          Notitie (optioneel)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
            placeholder="Bv. zonder ui"
          />
        </label>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="min-h-[56px] min-w-[56px] rounded-full bg-[var(--color-border)] text-2xl"
              aria-label="Minder"
            >
              −
            </button>
            <span className="min-w-[2ch] text-center text-xl font-semibold">
              {qty}
            </span>
            <button
              onClick={() => setQty(qty + 1)}
              className="min-h-[56px] min-w-[56px] rounded-full bg-[var(--color-border)] text-2xl"
              aria-label="Meer"
            >
              +
            </button>
          </div>
          <button
            disabled={!allMinsMet}
            onClick={() => onConfirm(flatModifiers, qty, note || undefined)}
            className="min-h-[64px] flex-1 rounded-xl bg-[var(--color-brand)] p-3 text-lg font-semibold text-white disabled:opacity-40"
          >
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  )
}

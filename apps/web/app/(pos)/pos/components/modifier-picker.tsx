"use client"
import { useState } from "react"
import { X } from "lucide-react"
import type { MenuItem, ModifierGroup, ModifierOption } from "@/lib/pos/types"
import { Button } from "@/components/ui/button"
import { QtyStepper } from "@/components/ui/qty-stepper"
import { euroCents } from "@/lib/format"
import { cn } from "@/lib/cn"

export function ModifierPicker({
  item,
  groups,
  initialQty = 1,
  onConfirm,
  onCancel,
}: {
  item: MenuItem
  groups: ModifierGroup[]
  initialQty?: number
  onConfirm: (
    modifiers: ModifierOption[],
    qty: number,
    note: string | undefined,
  ) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Record<string, ModifierOption[]>>({})
  const [qty, setQty] = useState(initialQty)
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
      aria-label={item.name}
      className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(27,32,29,0.55)] p-6"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-[680px] max-w-full flex-col overflow-hidden rounded-xl border border-line-strong bg-paper"
      >
        <div className="flex flex-none items-center justify-between border-b border-line px-7 py-6">
          <span className="text-[24px] font-extrabold leading-none text-charcoal-900">
            {item.name}
          </span>
          <button
            type="button"
            aria-label="Annuleer"
            onClick={onCancel}
            className="inline-flex h-12 w-12 items-center justify-center text-charcoal-600"
          >
            <X size={26} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-7">
          {groups.length === 0 ? (
            <p className="text-[16px] font-medium text-charcoal-500">
              Geen opties — direct toevoegen.
            </p>
          ) : (
            groups.map((g) => {
              const list = selected[g.id] ?? []
              return (
                <fieldset key={g.id} className="mb-6">
                  <legend className="mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
                    {g.name}
                    {g.min_select > 0 ? (
                      <span className="normal-case tracking-normal text-brick-600">
                        verplicht (min {g.min_select})
                      </span>
                    ) : null}
                  </legend>
                  <div className="grid grid-cols-2 gap-2.5">
                    {g.options.map((opt) => {
                      const on = list.some((m) => m.id === opt.id)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggle(g, opt)}
                          className={cn(
                            "flex min-h-16 flex-col justify-center rounded-md border px-4 py-3 text-left transition-[background,border-color,color] duration-[var(--dur-fast)]",
                            on
                              ? "border-hop-600 bg-hop-600 text-[var(--text-on-accent)]"
                              : "border-line-strong bg-paper-bright text-charcoal-900 hover:bg-offwhite"
                          )}
                        >
                          <span className="text-[18px] font-bold leading-[1.15]">
                            {opt.name}
                          </span>
                          {opt.surcharge_cents > 0 ? (
                            <span
                              className={cn(
                                "hb-tabular mt-1 text-[14px] font-medium leading-none",
                                on ? "opacity-85" : "text-charcoal-500"
                              )}
                            >
                              + {euroCents(opt.surcharge_cents)}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )
            })
          )}

          <label className="block">
            <span className="mb-2 block text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
              Notitie (optioneel)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Bv. zonder ui"
              className="h-[52px] w-full rounded-md border border-line-strong bg-paper-bright px-4 text-[17px] font-semibold text-charcoal-900 outline-none placeholder:text-charcoal-400"
            />
          </label>
        </div>

        <div className="flex flex-none items-center justify-between gap-4 border-t border-line px-7 py-5">
          <QtyStepper value={qty} min={1} onChange={setQty} />
          <Button
            variant="primary"
            size="lg"
            disabled={!allMinsMet}
            onClick={() => onConfirm(flatModifiers, qty, note || undefined)}
            className="flex-1"
          >
            Toevoegen
          </Button>
        </div>
      </div>
    </div>
  )
}

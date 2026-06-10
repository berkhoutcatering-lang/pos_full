"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import type { AdminModifierGroup } from "@/lib/dal/admin-menu"
import { euroCents } from "@/lib/format"
import {
  createModifierGroupAction,
  deactivateModifierGroupAction,
  updateModifierGroupAction,
} from "./modifier-actions"

const ERROR_TEXT: Record<string, string> = {
  name_exists: "Er bestaat al een optiegroep met deze naam.",
  validation: "Controleer de invoer (minimaal 1 optie; max ≥ min).",
  offline: "Optiegroepen bewerken vereist internet.",
  insert_failed: "Opslaan mislukt.",
  update_failed: "Opslaan mislukt.",
}

interface OptionDraft {
  id: string
  name: string
  price: string // euros, "0,50"
}

interface GroupDraft {
  name: string
  min_select: string
  max_select: string
  options: OptionDraft[]
}

function emptyDraft(): GroupDraft {
  return {
    name: "",
    min_select: "0",
    max_select: "1",
    options: [{ id: crypto.randomUUID(), name: "", price: "0,00" }],
  }
}

function draftFromGroup(g: AdminModifierGroup): GroupDraft {
  return {
    name: g.name,
    min_select: String(g.min_select),
    max_select: String(g.max_select),
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      price: (o.surcharge_cents / 100).toFixed(2).replace(".", ","),
    })),
  }
}

function parseCents(raw: string): number | null {
  const cleaned = raw.trim().replace("€", "").replace(",", ".")
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(parseFloat(cleaned) * 100)
}

const inputCls =
  "h-11 rounded-md border border-line-strong bg-paper-bright px-3 text-[15px] font-semibold text-charcoal-900 outline-none"
const labelCls = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500"

function GroupForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: GroupDraft
  busy: boolean
  submitLabel: string
  onSubmit: (d: GroupDraft) => void
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState<GroupDraft>(initial)

  const setOption = (id: string, patch: Partial<OptionDraft>) =>
    setDraft((d) => ({
      ...d,
      options: d.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(draft)
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-3 gap-4 lg:grid-cols-[2fr_1fr_1fr]">
        <label>
          <span className={labelCls}>Naam groep</span>
          <input
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={`${inputCls} w-full`}
            placeholder="Sauzen"
          />
        </label>
        <label>
          <span className={labelCls}>Min. keuzes</span>
          <input
            required
            inputMode="numeric"
            value={draft.min_select}
            onChange={(e) => setDraft({ ...draft, min_select: e.target.value })}
            className={`${inputCls} hb-tabular w-full`}
          />
        </label>
        <label>
          <span className={labelCls}>Max. keuzes</span>
          <input
            required
            inputMode="numeric"
            value={draft.max_select}
            onChange={(e) => setDraft({ ...draft, max_select: e.target.value })}
            className={`${inputCls} hb-tabular w-full`}
          />
        </label>
      </div>

      <div>
        <span className={labelCls}>Opties (meerprijs mag 0 of negatief zijn)</span>
        <div className="flex flex-col gap-2">
          {draft.options.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <input
                required
                maxLength={60}
                value={o.name}
                onChange={(e) => setOption(o.id, { name: e.target.value })}
                className={`${inputCls} min-w-0 flex-1`}
                placeholder="Knoflooksaus"
              />
              <input
                required
                inputMode="decimal"
                value={o.price}
                onChange={(e) => setOption(o.id, { price: e.target.value })}
                className={`${inputCls} hb-tabular w-28 text-right`}
                placeholder="0,50"
              />
              <button
                type="button"
                aria-label="Optie verwijderen"
                disabled={draft.options.length <= 1}
                onClick={() =>
                  setDraft((d) => ({ ...d, options: d.options.filter((x) => x.id !== o.id) }))
                }
                className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-line-strong bg-paper-bright text-charcoal-500 disabled:opacity-40"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={draft.options.length >= 20}
          onClick={() =>
            setDraft((d) => ({
              ...d,
              options: [...d.options, { id: crypto.randomUUID(), name: "", price: "0,00" }],
            }))
          }
          className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-md border border-line-strong bg-paper-bright px-3.5 text-[14px] font-bold text-charcoal-700 disabled:opacity-40"
        >
          <Plus size={16} /> Optie toevoegen
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-md border border-hop-600 bg-hop-600 px-5 text-[15px] font-bold leading-none text-[var(--text-on-accent)] hover:bg-hop-700 disabled:opacity-60"
        >
          {busy ? "Bezig…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-md border border-line-strong bg-paper-bright px-4 text-[15px] font-bold leading-none text-charcoal-700"
          >
            Annuleer
          </button>
        ) : null}
      </div>
    </form>
  )
}

export function ModifierGroupsEditor({ groups }: { groups: AdminModifierGroup[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formKey, setFormKey] = useState(0)

  function submit(draft: GroupDraft, id?: string) {
    const min_select = parseInt(draft.min_select, 10)
    const max_select = parseInt(draft.max_select, 10)
    if (Number.isNaN(min_select) || Number.isNaN(max_select)) {
      setError("Min/max keuzes moeten getallen zijn.")
      return
    }
    const options: Array<{ id: string; name: string; surcharge_cents: number }> = []
    for (const o of draft.options) {
      const surcharge_cents = parseCents(o.price)
      if (surcharge_cents === null) {
        setError(`Meerprijs niet herkend bij "${o.name || "optie"}" — gebruik bijv. 0,50`)
        return
      }
      options.push({ id: o.id, name: o.name, surcharge_cents })
    }
    setError(null)
    startTransition(async () => {
      const payload = { name: draft.name, min_select, max_select, options }
      const res = id
        ? await updateModifierGroupAction({ ...payload, id })
        : await createModifierGroupAction(payload)
      if (!res.ok) {
        setError(ERROR_TEXT[res.error] ?? res.error)
        return
      }
      setEditingId(null)
      setCreating(false)
      setFormKey((k) => k + 1)
      router.refresh()
    })
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Optiegroep "${name}" verwijderen? Items verliezen deze opties.`)) return
    setError(null)
    startTransition(async () => {
      const res = await deactivateModifierGroupAction({ id })
      if (!res.ok) {
        setError(ERROR_TEXT[res.error] ?? res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-line-strong bg-paper-bright p-5">
      <div className="mb-1 text-[17px] font-extrabold leading-none text-charcoal-900">
        Optiegroepen
      </div>
      <p className="mb-4 text-[13px] font-medium leading-[1.4] text-charcoal-500">
        Keuzes die de kassa per item toont (sauzen, extra's). Koppel ze aan een
        item via "Bewerk" op het item. Bewerken vereist internet.
      </p>

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-brick-100 px-4 py-3 text-[14px] font-semibold text-brick-600">
          {error}
        </p>
      ) : null}

      {groups.length > 0 ? (
        <div className="mb-4 overflow-hidden rounded-md border border-line">
          {groups.map((g, i) => (
            <div key={g.id} className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
              {editingId === g.id ? (
                <GroupForm
                  initial={draftFromGroup(g)}
                  busy={pending}
                  submitLabel="Opslaan"
                  onSubmit={(d) => submit(d, g.id)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold leading-none text-charcoal-900">
                      {g.name}{" "}
                      <span className="font-semibold text-charcoal-500">
                        · kies {g.min_select}–{g.max_select}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[13px] font-medium leading-none text-charcoal-500">
                      {g.options
                        .map(
                          (o) =>
                            `${o.name}${o.surcharge_cents !== 0 ? ` (${euroCents(o.surcharge_cents)})` : ""}`,
                        )
                        .join(" · ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingId(g.id)}
                    className="h-9 rounded-md border border-line-strong bg-paper-bright px-3.5 text-[13px] font-bold text-charcoal-700"
                  >
                    Bewerk
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(g.id, g.name)}
                    className="h-9 rounded-md border border-brick-600/30 bg-brick-100 px-3.5 text-[13px] font-bold text-brick-600"
                  >
                    Verwijder
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-[14px] font-medium text-charcoal-500">
          Nog geen optiegroepen.
        </p>
      )}

      {creating ? (
        <GroupForm
          key={formKey}
          initial={emptyDraft()}
          busy={pending}
          submitLabel="Groep toevoegen"
          onSubmit={(d) => submit(d)}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-md border border-hop-600 bg-hop-600 px-4 text-[15px] font-bold leading-none text-[var(--text-on-accent)] hover:bg-hop-700"
        >
          <Plus size={17} /> Nieuwe optiegroep
        </button>
      )}
    </div>
  )
}

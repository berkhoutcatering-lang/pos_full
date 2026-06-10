"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import type { AdminCombo, AdminMenuItem, AdminStaffel } from "@/lib/dal/admin-menu"
import { euroCents } from "@/lib/format"
import {
  createComboAction,
  createStaffelAction,
  deactivateComboAction,
  deactivateStaffelAction,
  updateComboAction,
  updateStaffelAction,
} from "./deal-actions"

const ERROR_TEXT: Record<string, string> = {
  name_exists: "Er bestaat al een deal met deze naam.",
  validation: "Controleer de invoer (minimaal 1 item, korting > 0).",
  offline: "Deals bewerken vereist internet.",
  save_failed: "Opslaan mislukt.",
}

const inputCls =
  "h-11 rounded-md border border-line-strong bg-paper-bright px-3 text-[15px] font-semibold text-charcoal-900 outline-none"
const labelCls = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500"
const primaryBtn =
  "h-11 rounded-md border border-hop-600 bg-hop-600 px-5 text-[15px] font-bold leading-none text-[var(--text-on-accent)] hover:bg-hop-700 disabled:opacity-60"
const cancelBtn =
  "h-11 rounded-md border border-line-strong bg-paper-bright px-4 text-[15px] font-bold leading-none text-charcoal-700"
const editBtn =
  "h-9 rounded-md border border-line-strong bg-paper-bright px-3.5 text-[13px] font-bold text-charcoal-700"
const deleteBtn =
  "h-9 rounded-md border border-brick-600/30 bg-brick-100 px-3.5 text-[13px] font-bold text-brick-600"

function parseCents(raw: string): number | null {
  const cleaned = raw.trim().replace("€", "").replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(parseFloat(cleaned) * 100)
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",")
}

// ---------------- Combo's ----------------

interface ComboDraft {
  name: string
  discount: string
  qtyByItem: Record<string, number> // alleen aangevinkte items
}

function ComboForm({
  initial,
  items,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ComboDraft
  items: AdminMenuItem[]
  busy: boolean
  submitLabel: string
  onSubmit: (d: ComboDraft) => void
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState<ComboDraft>(initial)
  const toggle = (id: string, on: boolean) =>
    setDraft((d) => {
      const qtyByItem = { ...d.qtyByItem }
      if (on) qtyByItem[id] = qtyByItem[id] ?? 1
      else delete qtyByItem[id]
      return { ...d, qtyByItem }
    })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(draft)
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-[2fr_1fr]">
        <label>
          <span className={labelCls}>Naam combo</span>
          <input
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={`${inputCls} w-full`}
            placeholder="Menu-deal: langos + drankje"
          />
        </label>
        <label>
          <span className={labelCls}>Korting</span>
          <input
            required
            inputMode="decimal"
            value={draft.discount}
            onChange={(e) => setDraft({ ...draft, discount: e.target.value })}
            className={`${inputCls} hb-tabular w-full`}
            placeholder="1,50"
          />
        </label>
      </div>
      <div>
        <span className={labelCls}>Trigger-items (korting geldt zodra ze samen op de bon staan)</span>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const checked = it.id in draft.qtyByItem
            return (
              <div key={it.id} className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold text-charcoal-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(it.id, e.target.checked)}
                    className="h-4 w-4 flex-none"
                  />
                  <span className="truncate">{it.name}</span>
                </label>
                {checked ? (
                  <input
                    inputMode="numeric"
                    aria-label={`Aantal ${it.name}`}
                    value={draft.qtyByItem[it.id]}
                    onChange={(e) => {
                      const n = parseInt(e.target.value || "1", 10)
                      setDraft((d) => ({
                        ...d,
                        qtyByItem: { ...d.qtyByItem, [it.id]: Number.isNaN(n) ? 1 : Math.max(1, Math.min(20, n)) },
                      }))
                    }}
                    className={`${inputCls} hb-tabular h-9 w-14 flex-none text-center`}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Bezig…" : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={cancelBtn}>
            Annuleer
          </button>
        ) : null}
      </div>
    </form>
  )
}

// ---------------- Staffels ----------------

interface StaffelDraft {
  name: string
  threshold: string
  perExtra: string
  itemIds: string[]
}

function StaffelForm({
  initial,
  items,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: StaffelDraft
  items: AdminMenuItem[]
  busy: boolean
  submitLabel: string
  onSubmit: (d: StaffelDraft) => void
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState<StaffelDraft>(initial)
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
          <span className={labelCls}>Naam staffel</span>
          <input
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className={`${inputCls} w-full`}
            placeholder="Vanaf 5 broodjes"
          />
        </label>
        <label>
          <span className={labelCls}>Vanaf aantal</span>
          <input
            required
            inputMode="numeric"
            value={draft.threshold}
            onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
            className={`${inputCls} hb-tabular w-full`}
            placeholder="5"
          />
        </label>
        <label>
          <span className={labelCls}>Korting per extra</span>
          <input
            required
            inputMode="decimal"
            value={draft.perExtra}
            onChange={(e) => setDraft({ ...draft, perExtra: e.target.value })}
            className={`${inputCls} hb-tabular w-full`}
            placeholder="0,50"
          />
        </label>
      </div>
      <div>
        <span className={labelCls}>Geldt voor items</span>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <label key={it.id} className="flex items-center gap-2 text-[14px] font-semibold text-charcoal-700">
              <input
                type="checkbox"
                checked={draft.itemIds.includes(it.id)}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    itemIds: e.target.checked
                      ? [...d.itemIds, it.id]
                      : d.itemIds.filter((x) => x !== it.id),
                  }))
                }
                className="h-4 w-4 flex-none"
              />
              <span className="truncate">{it.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Bezig…" : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={cancelBtn}>
            Annuleer
          </button>
        ) : null}
      </div>
    </form>
  )
}

// ---------------- Container ----------------

export function DealsEditor({
  items,
  combos,
  staffels,
}: {
  items: AdminMenuItem[]
  combos: AdminCombo[]
  staffels: AdminStaffel[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [comboEditing, setComboEditing] = useState<string | null>(null)
  const [comboCreating, setComboCreating] = useState(false)
  const [staffelEditing, setStaffelEditing] = useState<string | null>(null)
  const [staffelCreating, setStaffelCreating] = useState(false)

  const nameById = new Map(items.map((i) => [i.id, i.name]))

  function submitCombo(d: ComboDraft, id?: string) {
    const discount_cents = parseCents(d.discount)
    if (discount_cents === null || discount_cents <= 0) {
      setError("Korting niet herkend — gebruik bijv. 1,50")
      return
    }
    if (Object.keys(d.qtyByItem).length === 0) {
      setError("Kies minimaal één trigger-item voor de combo.")
      return
    }
    setError(null)
    startTransition(async () => {
      const payload = { name: d.name, trigger_min_qty: d.qtyByItem, discount_cents }
      const res = id
        ? await updateComboAction({ ...payload, id })
        : await createComboAction(payload)
      if (!res.ok) {
        setError(ERROR_TEXT[res.error] ?? res.error)
        return
      }
      setComboEditing(null)
      setComboCreating(false)
      router.refresh()
    })
  }

  function submitStaffel(d: StaffelDraft, id?: string) {
    const qty_threshold = parseInt(d.threshold, 10)
    const discount_per_extra_cents = parseCents(d.perExtra)
    if (Number.isNaN(qty_threshold) || qty_threshold < 1) {
      setError("Vanaf-aantal niet herkend.")
      return
    }
    if (discount_per_extra_cents === null || discount_per_extra_cents <= 0) {
      setError("Korting per extra niet herkend — gebruik bijv. 0,50")
      return
    }
    if (d.itemIds.length === 0) {
      setError("Kies minimaal één item voor de staffel.")
      return
    }
    setError(null)
    startTransition(async () => {
      const payload = {
        name: d.name,
        applies_to_item_ids: d.itemIds,
        qty_threshold,
        discount_per_extra_cents,
      }
      const res = id
        ? await updateStaffelAction({ ...payload, id })
        : await createStaffelAction(payload)
      if (!res.ok) {
        setError(ERROR_TEXT[res.error] ?? res.error)
        return
      }
      setStaffelEditing(null)
      setStaffelCreating(false)
      router.refresh()
    })
  }

  function removeCombo(id: string, name: string) {
    if (!window.confirm(`Combo "${name}" verwijderen?`)) return
    startTransition(async () => {
      const res = await deactivateComboAction({ id })
      if (!res.ok) setError(ERROR_TEXT[res.error] ?? res.error)
      else router.refresh()
    })
  }

  function removeStaffel(id: string, name: string) {
    if (!window.confirm(`Staffel "${name}" verwijderen?`)) return
    startTransition(async () => {
      const res = await deactivateStaffelAction({ id })
      if (!res.ok) setError(ERROR_TEXT[res.error] ?? res.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-7">
      {error ? (
        <p role="alert" className="rounded-md bg-brick-100 px-4 py-3 text-[14px] font-semibold text-brick-600">
          {error}
        </p>
      ) : null}

      {/* Combo's */}
      <div className="rounded-lg border border-line-strong bg-paper-bright p-5">
        <div className="mb-1 text-[17px] font-extrabold leading-none text-charcoal-900">
          Combo-deals
        </div>
        <p className="mb-4 text-[13px] font-medium leading-[1.4] text-charcoal-500">
          Vaste korting zodra de trigger-items samen op de bon staan. De kassa
          past dit automatisch toe. Bewerken vereist internet.
        </p>
        {combos.length > 0 ? (
          <div className="mb-4 overflow-hidden rounded-md border border-line">
            {combos.map((c, i) => (
              <div key={c.id} className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                {comboEditing === c.id ? (
                  <ComboForm
                    initial={{
                      name: c.name,
                      discount: centsToInput(c.discount_cents),
                      qtyByItem: Object.fromEntries(
                        c.trigger_item_ids.map((id) => [id, c.trigger_min_qty[id] ?? 1]),
                      ),
                    }}
                    items={items}
                    busy={pending}
                    submitLabel="Opslaan"
                    onSubmit={(d) => submitCombo(d, c.id)}
                    onCancel={() => setComboEditing(null)}
                  />
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold leading-none text-charcoal-900">
                        {c.name}{" "}
                        <span className="font-semibold text-hop-700">
                          −{euroCents(c.discount_cents)}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[13px] font-medium leading-none text-charcoal-500">
                        {c.trigger_item_ids
                          .map((id) => {
                            const qty = c.trigger_min_qty[id] ?? 1
                            return `${qty}× ${nameById.get(id) ?? "?"}`
                          })
                          .join(" + ")}
                      </div>
                    </div>
                    <button type="button" onClick={() => setComboEditing(c.id)} className={editBtn}>
                      Bewerk
                    </button>
                    <button type="button" onClick={() => removeCombo(c.id, c.name)} className={deleteBtn}>
                      Verwijder
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-[14px] font-medium text-charcoal-500">Nog geen combo-deals.</p>
        )}
        {comboCreating ? (
          <ComboForm
            initial={{ name: "", discount: "", qtyByItem: {} }}
            items={items}
            busy={pending}
            submitLabel="Combo toevoegen"
            onSubmit={(d) => submitCombo(d)}
            onCancel={() => setComboCreating(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComboCreating(true)}
            disabled={items.length === 0}
            className={`${primaryBtn} inline-flex items-center gap-1.5`}
          >
            <Plus size={17} /> Nieuwe combo
          </button>
        )}
      </div>

      {/* Staffels */}
      <div className="rounded-lg border border-line-strong bg-paper-bright p-5">
        <div className="mb-1 text-[17px] font-extrabold leading-none text-charcoal-900">
          Staffelkorting
        </div>
        <p className="mb-4 text-[13px] font-medium leading-[1.4] text-charcoal-500">
          Vanaf een drempel-aantal krijgt elk extra item korting (bijv. vanaf 5
          broodjes €0,50 per extra broodje). Bewerken vereist internet.
        </p>
        {staffels.length > 0 ? (
          <div className="mb-4 overflow-hidden rounded-md border border-line">
            {staffels.map((s, i) => (
              <div key={s.id} className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                {staffelEditing === s.id ? (
                  <StaffelForm
                    initial={{
                      name: s.name,
                      threshold: String(s.qty_threshold),
                      perExtra: centsToInput(s.discount_per_extra_cents),
                      itemIds: s.applies_to_item_ids,
                    }}
                    items={items}
                    busy={pending}
                    submitLabel="Opslaan"
                    onSubmit={(d) => submitStaffel(d, s.id)}
                    onCancel={() => setStaffelEditing(null)}
                  />
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold leading-none text-charcoal-900">
                        {s.name}{" "}
                        <span className="font-semibold text-hop-700">
                          vanaf {s.qty_threshold} st. −{euroCents(s.discount_per_extra_cents)}/extra
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[13px] font-medium leading-none text-charcoal-500">
                        {s.applies_to_item_ids.map((id) => nameById.get(id) ?? "?").join(" · ")}
                      </div>
                    </div>
                    <button type="button" onClick={() => setStaffelEditing(s.id)} className={editBtn}>
                      Bewerk
                    </button>
                    <button type="button" onClick={() => removeStaffel(s.id, s.name)} className={deleteBtn}>
                      Verwijder
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-[14px] font-medium text-charcoal-500">Nog geen staffels.</p>
        )}
        {staffelCreating ? (
          <StaffelForm
            initial={{ name: "", threshold: "5", perExtra: "", itemIds: [] }}
            items={items}
            busy={pending}
            submitLabel="Staffel toevoegen"
            onSubmit={(d) => submitStaffel(d)}
            onCancel={() => setStaffelCreating(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setStaffelCreating(true)}
            disabled={items.length === 0}
            className={`${primaryBtn} inline-flex items-center gap-1.5`}
          >
            <Plus size={17} /> Nieuwe staffel
          </button>
        )}
      </div>
    </div>
  )
}

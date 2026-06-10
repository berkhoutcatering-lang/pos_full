"use client"
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { AdminMenuItem } from "@/lib/dal/admin-menu"
import { BTW_CLASS_LABEL } from "@/lib/pos/btw"
import { accentForCategory, labelForCategory } from "@/lib/pos/menu-groups"
import { euroCents } from "@/lib/format"
import {
  createMenuItemAction,
  deactivateMenuItemAction,
  updateMenuItemAction,
} from "./actions"

const STATION_LABEL: Record<string, string> = {
  grill: "Grill",
  fryer: "Frituur",
  cold: "Koud",
  bar: "Bar",
}

const ERROR_TEXT: Record<string, string> = {
  name_exists: "Er bestaat al een item met deze naam.",
  validation: "Controleer de invoer.",
  insert_failed: "Opslaan mislukt.",
  update_failed: "Opslaan mislukt.",
  offline_failed: "Offline opslaan via de Pi-bridge lukte niet — is de pi-bridge service gezond?",
}

function parsePriceCents(raw: string): number | null {
  const cleaned = raw.trim().replace("€", "").replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Math.round(parseFloat(cleaned) * 100)
}

interface FormState {
  name: string
  category: string
  price: string
  btw_class: string
  station: string
  is_discountable: boolean
}

const EMPTY_FORM: FormState = {
  name: "",
  category: "",
  price: "",
  btw_class: "food_9",
  station: "grill",
  is_discountable: true,
}

function ItemForm({
  initial,
  busy,
  submitLabel,
  categories,
  onSubmit,
  onCancel,
}: {
  initial: FormState
  busy: boolean
  submitLabel: string
  categories: string[]
  onSubmit: (f: FormState) => void
  onCancel?: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)
  const inputCls =
    "h-12 rounded-md border border-line-strong bg-paper-bright px-3.5 text-[15px] font-semibold text-charcoal-900 outline-none"
  const labelCls =
    "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500"
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="grid grid-cols-2 gap-4 lg:grid-cols-[2fr_1.4fr_1fr_1.4fr_1fr_auto]"
    >
      <label>
        <span className={labelCls}>Naam</span>
        <input
          required
          maxLength={80}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={`${inputCls} w-full`}
          placeholder="Langos kaas"
        />
      </label>
      <label>
        <span className={labelCls}>Categorie</span>
        <input
          required
          maxLength={40}
          list="hb-categories"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className={`${inputCls} w-full`}
          placeholder="langos"
        />
        <datalist id="hb-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label>
        <span className={labelCls}>Prijs</span>
        <input
          required
          inputMode="decimal"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className={`${inputCls} w-full hb-tabular`}
          placeholder="7,50"
        />
      </label>
      <label>
        <span className={labelCls}>BTW</span>
        <select
          value={form.btw_class}
          onChange={(e) => setForm({ ...form, btw_class: e.target.value })}
          className={`${inputCls} w-full`}
        >
          {Object.entries(BTW_CLASS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={labelCls}>Station</span>
        <select
          value={form.station}
          onChange={(e) => setForm({ ...form, station: e.target.value })}
          className={`${inputCls} w-full`}
        >
          {Object.entries(STATION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-3">
        <label className="flex h-12 items-center gap-2 text-[14px] font-semibold text-charcoal-700">
          <input
            type="checkbox"
            checked={form.is_discountable}
            onChange={(e) => setForm({ ...form, is_discountable: e.target.checked })}
            className="h-4 w-4"
          />
          Kortbaar
        </label>
        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-md border border-hop-600 bg-hop-600 px-5 text-[15px] font-bold leading-none text-[var(--text-on-accent)] hover:bg-hop-700 disabled:opacity-60"
        >
          {busy ? "Bezig…" : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-md border border-line-strong bg-paper-bright px-4 text-[15px] font-bold leading-none text-charcoal-700"
          >
            Annuleer
          </button>
        ) : null}
      </div>
    </form>
  )
}

export function MenuEditor({ items }: { items: AdminMenuItem[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))),
    [items],
  )

  function run(form: FormState, id?: string) {
    const price_cents = parsePriceCents(form.price)
    if (price_cents === null) {
      setError("Prijs niet herkend — gebruik bijv. 7,50")
      return
    }
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const payload = {
        name: form.name,
        category: form.category.trim().toLowerCase(),
        price_cents,
        btw_class: form.btw_class,
        station: form.station,
        is_discountable: form.is_discountable,
      }
      const res = id
        ? await updateMenuItemAction({ ...payload, id })
        : await createMenuItemAction(payload)
      if (!res.ok) {
        setError(ERROR_TEXT[res.error] ?? res.error)
        return
      }
      if (res.queued) {
        setNotice("Offline opgeslagen op de Pi — synct automatisch met de cloud zodra er internet is.")
      }
      setEditingId(null)
      setFormKey((k) => k + 1) // reset het nieuw-item formulier
      router.refresh()
    })
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`"${name}" van het menu halen?`)) return
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await deactivateMenuItemAction({ id })
      if (!res.ok) {
        setError(ERROR_TEXT[res.error] ?? res.error)
        return
      }
      if (res.queued) {
        setNotice("Offline verwijderd op de Pi — synct automatisch met de cloud zodra er internet is.")
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="rounded-lg border border-line-strong bg-paper-bright p-5">
        <div className="mb-4 text-[17px] font-extrabold leading-none text-charcoal-900">
          Nieuw item
        </div>
        <ItemForm
          key={formKey}
          initial={EMPTY_FORM}
          busy={pending}
          submitLabel="Toevoegen"
          categories={categories}
          onSubmit={(f) => run(f)}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-brick-100 px-4 py-3 text-[15px] font-semibold text-brick-600"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md bg-hop-600/10 px-4 py-3 text-[15px] font-semibold text-hop-700">
          {notice}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-[15px] font-medium text-charcoal-500">
          Nog geen menu-items — voeg hierboven je eerste item toe.
        </p>
      ) : null}

      {categories.map((cat, ci) => (
        <div key={cat}>
          <div className="mb-3 flex items-center gap-2.5">
            <span
              className="h-3 w-3 rounded-[3px]"
              style={{ background: accentForCategory(cat, ci) }}
            />
            <span className="text-[17px] font-extrabold leading-none text-charcoal-900">
              {labelForCategory(cat)}
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-line-strong bg-paper-bright">
            {items
              .filter((i) => i.category === cat)
              .map((it, i) => (
                <div
                  key={it.id}
                  className={`px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  {editingId === it.id ? (
                    <ItemForm
                      initial={{
                        name: it.name,
                        category: it.category,
                        price: (it.base_price_cents / 100).toFixed(2).replace(".", ","),
                        btw_class: it.btw_class,
                        station: it.station,
                        is_discountable: it.is_discountable,
                      }}
                      busy={pending}
                      submitLabel="Opslaan"
                      categories={categories}
                      onSubmit={(f) => run(f, it.id)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-[16px] font-bold leading-none text-charcoal-900">
                          {it.name}
                        </div>
                        <div className="mt-1 text-[13px] font-medium leading-none text-charcoal-500">
                          {BTW_CLASS_LABEL[it.btw_class as keyof typeof BTW_CLASS_LABEL] ?? it.btw_class}
                          {" · "}
                          {STATION_LABEL[it.station] ?? it.station}
                          {!it.is_discountable ? " · niet kortbaar" : ""}
                        </div>
                      </div>
                      <span className="hb-tabular min-w-[78px] text-right text-[16px] font-bold leading-none text-charcoal-900">
                        {euroCents(it.base_price_cents)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingId(it.id)}
                        className="h-9 rounded-md border border-line-strong bg-paper-bright px-3.5 text-[13px] font-bold text-charcoal-700"
                      >
                        Bewerk
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(it.id, it.name)}
                        className="h-9 rounded-md border border-brick-600/30 bg-brick-100 px-3.5 text-[13px] font-bold text-brick-600"
                      >
                        Verwijder
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

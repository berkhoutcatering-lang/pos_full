"use client"
import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { ulid } from "ulid"
import { Check } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { openDrawerViaPi } from "@/lib/pi-bridge/client"
import { cartReducer, initialCart, type CartState } from "@/lib/pos/cart-reducer"
import { priceCart } from "@/lib/pos/pricing"
import type { MenuItem, MenuSnapshot, ModifierGroup } from "@/lib/pos/types"
import { KassaTopBar } from "./kassa-top-bar"
import { ReceiptPanel } from "./receipt-panel"
import { NumpadCell } from "./numpad-cell"
import { ProductArea } from "./product-area"
import { BottomDock, type UtilityAction } from "./bottom-dock"
import {
  PaymentOverlay,
  type AttemptKeys,
  type CheckoutMethod,
} from "./payment-overlay"
import { SplitOverlay } from "./split-overlay"
import { NoteOverlay } from "./note-overlay"
import { ModifierPicker } from "./modifier-picker"
import { ProductSearch } from "./product-search"

export interface PosShellProps {
  initialMenu: MenuSnapshot
  claims: { orgId: string; venueId: string; role: string }
}

function freshAttempt(): AttemptKeys {
  return {
    order_id: crypto.randomUUID(),
    order_idempotency_key: ulid(),
    kitchen_print_key: ulid(),
    receipt_print_key: ulid(),
    pin_idempotency_key: ulid(),
  }
}

interface HeldBon {
  cart: CartState
  discountPct: number
  heldAt: number
}

export function PosShell({ initialMenu, claims }: PosShellProps) {
  const [cart, dispatch] = useReducer(cartReducer, initialCart)
  const [menu, setMenu] = useState<MenuSnapshot>(initialMenu)

  // Realtime: manager flips availability / stock / price-override op
  // /admin/operational/* → kassa updates direct (≤500ms).
  useEffect(() => {
    const ch = supabase
      .channel(`org:${claims.orgId}:venue:${claims.venueId}:menu`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pos_menu_items",
          filter: `venue_id=eq.${claims.venueId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            stock_qty: number | null
            is_available_override: boolean | null
            price_override_cents: number | null
            price_override_expires_at: string | null
            base_price_cents: number
            is_active: boolean
          }
          const now = Date.now()
          const stockOut = row.stock_qty !== null && row.stock_qty <= 0
          const offByMgr = row.is_available_override === false
          const inactive = row.is_active === false
          const isAvailable = !inactive && !stockOut && !offByMgr
          const overrideActive =
            row.price_override_cents !== null &&
            (!row.price_override_expires_at ||
              new Date(row.price_override_expires_at).getTime() > now)
          const effective = overrideActive
            ? row.price_override_cents!
            : row.base_price_cents

          setMenu((cur) => {
            const exists = cur.items.find((i) => i.id === row.id)
            // Item became unavailable → remove from menu.
            if (!isAvailable) {
              return { ...cur, items: cur.items.filter((i) => i.id !== row.id) }
            }
            // Item updated → patch price.
            if (exists) {
              return {
                ...cur,
                items: cur.items.map((i) =>
                  i.id === row.id ? { ...i, base_price_cents: effective } : i,
                ),
              }
            }
            // Item became available again — we don't have full row data
            // (name/category etc.) from the realtime event; the manager
            // flips "weer aan" between rushes, an explicit refresh is OK.
            return cur
          })
        },
      )
      .subscribe()
    return () => {
      void ch.unsubscribe()
    }
  }, [claims.orgId, claims.venueId])

  // ---- Kassa client state (mirrors the design reference) ----
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingQty, setPendingQty] = useState("")
  const [discountPct, setDiscountPct] = useState(0)
  const [holds, setHolds] = useState<HeldBon[]>([])
  const [payMethod, setPayMethod] = useState<CheckoutMethod | "choose" | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [noteFor, setNoteFor] = useState<"klant" | "notitie" | null>(null)
  const [kortingOpen, setKortingOpen] = useState(false)
  const [retourArmed, setRetourArmed] = useState(false)
  const retourTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pickerFor, setPickerFor] = useState<MenuItem | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // One attempt = one customer transaction; survives overlay close/reopen
  // so retries stay idempotent. Reset only after a successful payment.
  const attemptRef = useRef<AttemptKeys>(freshAttempt())

  const flash = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  const priced = useMemo(
    () => priceCart(cart.items, menu.combos, menu.staffels, discountPct),
    [cart.items, menu.combos, menu.staffels, discountPct],
  )
  const empty = priced.items.length === 0

  const modsForItem = (item: MenuItem): ModifierGroup[] =>
    menu.modifier_groups.filter((g) =>
      item.available_modifier_group_ids.includes(g.id),
    )

  const handleAdd = (item: MenuItem) => {
    const qty = Math.max(1, parseInt(pendingQty || "1", 10))
    const groups = modsForItem(item)
    if (groups.length > 0) {
      setPickerFor(item)
      return
    }
    dispatch({ type: "add", menu_item: item, qty })
    if (pendingQty) setPendingQty("")
  }

  const resetBon = () => {
    dispatch({ type: "clear" })
    setSelectedId(null)
    setDiscountPct(0)
    setPendingQty("")
  }

  const onKorting = () => setKortingOpen(true)

  const applyKorting = (pct: number) => {
    setDiscountPct(pct)
    setKortingOpen(false)
    flash(pct > 0 ? `${pct}% korting toegepast` : "Korting verwijderd")
  }

  const onHold = () => {
    setHolds((h) => [...h, { cart, discountPct, heldAt: Date.now() }])
    resetBon()
    flash("Bon in de wacht gezet")
  }

  // Twee-staps retour: een hele bon weggooien mag geen enkele mis-tik
  // kosten. Eerste tik wapent (knop wordt "Zeker weten?"), tweede tik
  // binnen 3s annuleert echt.
  const onRetour = () => {
    if (!retourArmed) {
      setRetourArmed(true)
      if (retourTimer.current) clearTimeout(retourTimer.current)
      retourTimer.current = setTimeout(() => setRetourArmed(false), 3000)
      return
    }
    if (retourTimer.current) clearTimeout(retourTimer.current)
    setRetourArmed(false)
    resetBon()
    flash("Bon geannuleerd")
  }

  const onUtility = (a: UtilityAction) => {
    if (a === "lade") {
      // Echte drawer-kick via de bonprinter — geen nep-toast.
      void openDrawerViaPi().then((res) => {
        if (res.ok && res.data.ok) flash("Kassalade geopend")
        else flash("Lade niet bereikbaar — check de bonprinter")
      })
    } else setNoteFor(a)
  }

  // "In de wacht" on an empty bon resumes the most recently held bon.
  const onHoldKeyWithEmptyBon = () => {
    const last = holds[holds.length - 1]
    if (!last) return
    setHolds((h) => h.slice(0, -1))
    for (const it of last.cart.items) {
      dispatch({
        type: "add",
        menu_item: it.menu_item,
        modifiers: it.selected_modifiers,
        qty: it.qty,
        note: it.note,
      })
    }
    if (last.cart.customer_name)
      dispatch({ type: "set_customer", name: last.cart.customer_name })
    if (last.cart.notes) dispatch({ type: "set_order_note", note: last.cart.notes })
    setDiscountPct(last.discountPct)
    flash("Bon uit de wacht gehaald")
  }

  const onPaid = () => {
    attemptRef.current = freshAttempt()
    setPayMethod(null)
    resetBon()
    flash("Bon afgerond · naar keuken")
  }

  return (
    <div className="relative flex h-dvh flex-col bg-offwhite">
      <KassaTopBar />

      <div className="flex min-h-0 flex-1 gap-3 p-3.5">
        {/* Left column: receipt + numpad */}
        <div className="flex w-[var(--receipt-w)] max-w-[42vw] flex-none flex-col gap-3">
          <div className="min-h-0 flex-1">
            <ReceiptPanel
              priced={priced}
              dispatch={dispatch}
              selectedId={selectedId}
              onSelect={setSelectedId}
              discountPct={discountPct}
              holdCount={holds.length}
            />
          </div>
          <div className="h-[360px] flex-none">
            <NumpadCell value={pendingQty} onChange={setPendingQty} />
          </div>
        </div>

        {/* Right column: products + dock */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1">
            <ProductArea items={menu.items} onAdd={handleAdd} />
          </div>
          <BottomDock
            totalCents={priced.total_incl_cents}
            empty={empty}
            canResumeHold={holds.length > 0}
            discountPct={discountPct}
            onKorting={onKorting}
            retourArmed={retourArmed}
            onHold={empty ? onHoldKeyWithEmptyBon : onHold}
            onSplit={() => setSplitOpen(true)}
            onRetour={onRetour}
            onUtility={onUtility}
            onPay={(m) => {
              if (!empty) setPayMethod(m)
            }}
            onAfrekenen={() => {
              if (!empty) setPayMethod("choose")
            }}
          />
        </div>
      </div>

      {payMethod !== null ? (
        <PaymentOverlay
          initialMethod={payMethod === "choose" ? null : payMethod}
          priced={priced}
          cart={cart}
          claims={claims}
          attempt={attemptRef.current}
          onClose={() => setPayMethod(null)}
          onComplete={onPaid}
        />
      ) : null}

      {splitOpen ? (
        <SplitOverlay
          totalCents={priced.total_incl_cents}
          onClose={() => setSplitOpen(false)}
        />
      ) : null}

      {noteFor === "klant" ? (
        <NoteOverlay
          title="Klant"
          label="Klantnaam"
          placeholder="Bv. Jan"
          maxLength={64}
          initialValue={cart.customer_name ?? ""}
          onSave={(v) => {
            dispatch({ type: "set_customer", name: v || undefined })
            if (v) flash(`Klant: ${v}`)
          }}
          onClose={() => setNoteFor(null)}
        />
      ) : null}

      {noteFor === "notitie" ? (
        <NoteOverlay
          title="Notitie"
          label="Bon-notitie"
          placeholder="Bv. zonder ui"
          initialValue={cart.notes ?? ""}
          onSave={(v) => {
            dispatch({ type: "set_order_note", note: v })
            if (v) flash("Notitie toegevoegd")
          }}
          onClose={() => setNoteFor(null)}
        />
      ) : null}

      <ProductSearch items={menu.items} onPick={handleAdd} />

      {pickerFor ? (
        <ModifierPicker
          item={pickerFor}
          groups={modsForItem(pickerFor)}
          initialQty={Math.max(1, parseInt(pendingQty || "1", 10))}
          onConfirm={(modifiers, qty, note) => {
            dispatch({ type: "add", menu_item: pickerFor, modifiers, qty, note })
            setPickerFor(null)
            if (pendingQty) setPendingQty("")
          }}
          onCancel={() => setPickerFor(null)}
        />
      ) : null}

      {kortingOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Korting"
          className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(27,32,29,0.55)] p-6"
          onClick={() => setKortingOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[560px] max-w-full overflow-hidden rounded-xl border border-line-strong bg-paper p-7"
          >
            <div className="mb-5 text-[24px] font-extrabold leading-none text-charcoal-900">
              Korting op de bon
            </div>
            <div className="mb-4 flex gap-2.5">
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyKorting(pct)}
                  className={`hb-tabular h-[72px] flex-1 rounded-md border text-[24px] font-extrabold leading-none ${
                    discountPct === pct
                      ? "border-charcoal-900 bg-charcoal-900 text-offwhite"
                      : "border-line-strong bg-paper-bright text-charcoal-900 hover:bg-offwhite"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            {discountPct > 0 ? (
              <button
                type="button"
                onClick={() => applyKorting(0)}
                className="h-12 w-full rounded-md border border-brick-600/30 bg-brick-100 text-[16px] font-bold text-brick-600"
              >
                Korting verwijderen
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Toast: charcoal pill, bottom-center */}
      {toast ? (
        <div className="absolute bottom-7 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-md bg-charcoal-900 px-[26px] py-4 text-[18px] font-bold leading-none text-offwhite shadow-[var(--shadow-raised)]">
          <Check size={22} strokeWidth={3} className="text-hop-500" /> {toast}
        </div>
      ) : null}
    </div>
  )
}

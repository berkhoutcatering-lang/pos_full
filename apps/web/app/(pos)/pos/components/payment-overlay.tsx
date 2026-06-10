"use client"

import { useState } from "react"
import { Banknote, Check, CreditCard, X } from "lucide-react"
import type { CartState } from "@/lib/pos/cart-reducer"
import type { PricedCart } from "@/lib/pos/types"
import { btwRateFor } from "@/lib/pos/btw"
import {
  openDrawerViaPi,
  placeOrderViaPi,
  printKitchenViaPi,
  printReceiptViaPi,
} from "@/lib/pi-bridge/client"
import { useConnectionStatus } from "@/lib/pos/connection-status"
import { placeOrderAction } from "../actions"
import { Button } from "@/components/ui/button"
import { euroCents } from "@/lib/format"
import { CheckoutCash } from "./checkout-cash"
import { CheckoutPin } from "./checkout-pin"

export type CheckoutMethod = "cash" | "pin"

// One attempt = one customer transaction. The keys live in the SHELL (not
// here) so a close + reopen mid-payment reuses the same idempotency_key +
// order_id + print keys and the upstream dedup (pos_idempotency, Pi outbox,
// print_log) collapses retries.
export interface AttemptKeys {
  order_id: string
  order_idempotency_key: string
  kitchen_print_key: string
  receipt_print_key: string
  pin_idempotency_key: string
}

type Step = "choose" | "cash" | "pin" | "done"

// De checkout mag NOOIT blijven hangen (Resilience): server actions
// hebben geen eigen timeout, dus we racen ertegen. Dankzij de stabiele
// idempotency-keys is een actie die ná de timeout alsnog landt onschadelijk
// — een retry met dezelfde key dedupt upstream.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

const PAY_ERROR_TEXT: Record<string, string> = {
  pi_401: "Deze tablet is niet gekoppeld aan de Pi — open /pair en voer een pairing-code in.",
  pi_403: "Deze tablet is niet gekoppeld aan deze locatie — koppel opnieuw via /pair.",
  timeout: "Geen verbinding: Pi onbereikbaar én de cloud reageert niet. Check het netwerk en probeer opnieuw — de bon is nog niet geplaatst.",
  order_insert_failed: "Opslaan in de cloud mislukt — probeer opnieuw.",
  items_insert_failed: "Opslaan in de cloud mislukt — probeer opnieuw.",
  btw_rate_mismatch: "BTW-controle faalde — herlaad de kassa.",
  validation: "Ongeldige bon — herlaad de kassa.",
  place_failed: "Bestelling plaatsen mislukt — probeer opnieuw.",
  unexpected: "Er ging iets mis — probeer opnieuw. De bon is niet kwijt.",
}

export function PaymentOverlay({
  initialMethod,
  priced,
  cart,
  claims,
  attempt,
  onClose,
  onComplete,
}: {
  initialMethod: CheckoutMethod | null
  priced: PricedCart
  cart: CartState
  claims: { orgId: string; venueId: string; role: string }
  attempt: AttemptKeys
  onClose: () => void
  onComplete: (queueLabel: string | null) => void
}) {
  const [step, setStep] = useState<Step>(initialMethod ?? "choose")
  const [paidMethod, setPaidMethod] = useState<CheckoutMethod | null>(null)
  // Afroepnummer van de Pi (bestaat ook offline); fallback = klantnaam.
  const [queueLabel, setQueueLabel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connection = useConnectionStatus()
  const piDown = !connection.pi_ok

  async function placeOrder(method: CheckoutMethod): Promise<
    { ok: true } | { ok: false; error: string }
  > {
    const order_id = attempt.order_id
    const idempotency_key = attempt.order_idempotency_key

    const payload = {
      idempotency_key,
      order_id,
      org_id: claims.orgId,
      venue_id: claims.venueId,
      customer_label: cart.customer_name ?? null,
      items: priced.items.map((it) => ({
        id: it.cart_line_id,
        menu_item_id: it.menu_item.id,
        qty: it.qty,
        unit_price_cents: it.unit_price_cents,
        btw_class: it.menu_item.btw_class,
        modifiers: it.selected_modifiers.map((m) => ({
          id: m.id,
          name: m.name,
          price_delta_cents: m.surcharge_cents,
        })),
        note: it.note ?? null,
      })),
      totals: {
        excl_cents: priced.total_excl_cents,
        btw_cents: priced.total_btw_cents,
        incl_cents: priced.total_incl_cents,
        subtotal_cents: priced.subtotal_cents,
        discount_cents: priced.discount_cents,
      },
    }

    // Pi-first, Server-Action fallback. The Pi enqueues to its outbox and
    // returns synchronously; the Server Action writes through Supabase if
    // the Pi is unreachable.
    const pi = await placeOrderViaPi(payload)
    const piLabel = pi.ok ? (pi.data.queue_label ?? null) : null
    if (piLabel) setQueueLabel(piLabel)
    if (!pi.ok) {
      const fallback = await withTimeout(placeOrderAction({
        idempotency_key,
        order_id,
        customer_name: cart.customer_name ?? null,
        notes: cart.notes ?? null,
        subtotal_cents: priced.subtotal_cents,
        discount_cents: priced.discount_cents,
        total_excl_cents: priced.total_excl_cents,
        total_btw_cents: priced.total_btw_cents,
        total_incl_cents: priced.total_incl_cents,
        items: priced.items.map((it, idx) => ({
          position: idx,
          menu_item_id: it.menu_item.id,
          name: it.menu_item.name,
          category: it.menu_item.category,
          qty: it.qty,
          unit_price_cents: it.unit_price_cents,
          modifier_total_cents: it.modifier_total_cents,
          discount_cents: it.line_discount_cents,
          btw_class: it.menu_item.btw_class,
          btw_rate: btwRateFor(it.menu_item.btw_class),
          line_excl_cents: it.line_excl_cents,
          line_btw_cents: it.line_btw_cents,
          line_incl_cents: it.line_incl_cents,
          modifiers_json: it.selected_modifiers,
          notes: it.note ?? null,
        })),
      }), 8000, { ok: false as const, error: "timeout" })
      if (!fallback.ok) {
        // Geef de Pi-foutcode voorrang als die specifieker is (bv. niet
        // gepaird) — dat is wat de bediende moet oplossen.
        const piError = pi.error === "pi_401" || pi.error === "pi_403" ? pi.error : null
        return { ok: false, error: piError ?? fallback.error ?? "place_failed" }
      }
    }

    const order_label = piLabel ?? cart.customer_name ?? "#"

    // Fire-and-forget prints; stable keys so a double-tap never double-prints.
    void printKitchenViaPi({
      idempotency_key: attempt.kitchen_print_key,
      order_id,
      order_label,
      items: priced.items.map((it) => ({
        name: it.menu_item.name,
        qty: it.qty,
        modifiers: it.selected_modifiers.map((m) => m.name),
        note: it.note,
      })),
    })

    void printReceiptViaPi({
      idempotency_key: attempt.receipt_print_key,
      order_id,
      order_label,
      items: priced.items.map((it) => ({
        name: it.menu_item.name,
        qty: it.qty,
        price_cents:
          it.unit_price_cents + Math.round(it.modifier_total_cents / it.qty),
        btw_rate: btwRateFor(it.menu_item.btw_class),
      })),
      total_excl_cents: priced.total_excl_cents,
      total_btw_cents: priced.total_btw_cents,
      total_incl_cents: priced.total_incl_cents,
      paid_method: method,
      org_name: "Hop & Bites",
      org_kvk: "12345678",
      org_btw: "NL000000000B01",
    })

    return { ok: true }
  }

  const pay = async (method: CheckoutMethod) => {
    if (busy) return // synchronous guard against double-tap
    setBusy(true)
    setError(null)
    let res: { ok: true } | { ok: false; error: string }
    try {
      res = await placeOrder(method)
    } catch {
      res = { ok: false, error: "unexpected" }
    } finally {
      setBusy(false)
    }
    if (!res.ok) {
      setError(PAY_ERROR_TEXT[res.error] ?? res.error)
      return
    }
    // Contant betaald → lade automatisch open (fire-and-forget; zonder
    // drawer-kick op de printer gebeurt er gewoon niets).
    if (method === "cash") void openDrawerViaPi()
    setPaidMethod(method)
    setStep("done")
  }

  const dismissable = step === "choose" || step === "cash" || step === "pin"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Afrekenen"
      className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(27,32,29,0.55)] p-6"
      onClick={dismissable && !busy ? onClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[680px] max-w-full overflow-hidden rounded-xl border border-line-strong bg-paper shadow-[var(--shadow-raised)]"
      >
        {step !== "done" ? (
          <div className="flex items-center justify-between border-b border-line px-7 py-6">
            <span className="text-[24px] font-extrabold leading-none text-charcoal-900">
              {step === "cash" ? "Contant" : step === "pin" ? "PIN — myPOS" : "Afrekenen"}
            </span>
            <button
              type="button"
              aria-label="Sluiten"
              onClick={onClose}
              className="inline-flex h-12 w-12 items-center justify-center text-charcoal-600"
            >
              <X size={26} />
            </button>
          </div>
        ) : null}

        {step === "choose" ? (
          <div className="p-7">
            <div className="mb-6 flex items-baseline justify-between">
              <span className="text-[20px] font-semibold leading-none text-charcoal-500">
                Te betalen
              </span>
              <span className="hb-tabular text-[48px] font-extrabold leading-none text-charcoal-900">
                {euroCents(priced.total_incl_cents)}
              </span>
            </div>
            {piDown ? (
              <div
                role="alert"
                className="mb-4 rounded-md bg-brick-100 px-4 py-3 text-[15px] font-semibold text-brick-600"
              >
                Pi-bridge offline — alleen contant mogelijk tot de bridge weer
                verbonden is.
              </div>
            ) : null}
            <div className="flex gap-4">
              <MethodCard
                title="PIN"
                titleSuffix=" / Contactloos"
                sub="Tik of houd de kaart bij"
                icon={<CreditCard size={36} className="text-hop-700" />}
                disabled={piDown}
                onClick={() => setStep("pin")}
              />
              <MethodCard
                title="Contant"
                sub="Lade opent automatisch"
                icon={<Banknote size={36} className="text-hop-700" />}
                onClick={() => setStep("cash")}
              />
            </div>
            {error ? (
              <p role="alert" className="mt-4 text-[15px] font-semibold text-brick-600">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "cash" ? (
          <div className="p-7">
            <CheckoutCash
              priced={priced}
              busy={busy}
              error={error}
              onPay={() => pay("cash")}
              onBack={() => setStep("choose")}
            />
          </div>
        ) : null}

        {step === "pin" ? (
          <div className="p-7">
            <CheckoutPin
              busy={busy}
              error={error}
              onPay={() => pay("pin")}
              onBack={() => setStep("choose")}
              venueAmount={priced.total_incl_cents}
              orderId={attempt.order_id}
              pinIdempotencyKey={attempt.pin_idempotency_key}
            />
          </div>
        ) : null}

        {step === "done" ? (
          <div className="flex flex-col items-center gap-5 px-10 py-12 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-hop-600">
              <Check size={52} strokeWidth={3} className="text-offwhite" />
            </div>
            <div className="text-[30px] font-extrabold leading-[1.1] text-charcoal-900">
              Betaald ·{" "}
              <span className="hb-tabular">{euroCents(priced.total_incl_cents)}</span>
            </div>
            {queueLabel ? (
              <div className="rounded-lg bg-charcoal-900 px-8 py-4">
                <div className="text-[13px] font-bold uppercase tracking-[0.18em] text-charcoal-400">
                  Afroepnummer
                </div>
                <div className="hb-tabular text-[56px] font-black leading-none text-offwhite">
                  {queueLabel}
                </div>
              </div>
            ) : null}
            <div className="text-[17px] font-medium leading-[1.3] text-charcoal-500">
              {paidMethod === "pin"
                ? "PIN / contactloos geslaagd"
                : "Contant ontvangen"}{" "}
              · bon naar keuken
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => onComplete(queueLabel)}
              className="mt-3"
            >
              Nieuwe bon
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MethodCard({
  title,
  titleSuffix,
  sub,
  icon,
  onClick,
  disabled = false,
}: {
  title: string
  titleSuffix?: string
  sub: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-line-strong bg-paper-bright px-5 py-8 transition-[background,border-color] duration-[var(--dur-fast)] hover:border-hop-600 hover:bg-hop-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line-strong disabled:hover:bg-paper-bright"
    >
      <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[18px] bg-hop-100">
        {icon}
      </span>
      <span className="text-[24px] font-extrabold leading-none text-charcoal-900">
        <span>{title}</span>
        {titleSuffix ? <span>{titleSuffix}</span> : null}
      </span>
      <span className="text-[15px] font-medium leading-none text-charcoal-500">{sub}</span>
    </button>
  )
}

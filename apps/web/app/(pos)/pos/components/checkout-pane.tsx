"use client"
import { useRef, useState } from "react"
import { ulid } from "ulid"
import type { CartState } from "@/lib/pos/cart-reducer"
import type { PricedCart } from "@/lib/pos/types"
import { btwRateFor } from "@/lib/pos/btw"
import {
  placeOrderViaPi,
  printKitchenViaPi,
  printReceiptViaPi,
} from "@/lib/pi-bridge/client"
import { placeOrderAction } from "../actions"
import { CheckoutCash } from "./checkout-cash"
import { CheckoutPin } from "./checkout-pin"
import { useConnectionStatus } from "@/lib/pos/connection-status"

export type CheckoutMethod = "cash" | "pin"

// One attempt = one customer transaction. The keys live in a ref so a
// double-tap or post-error retry hits the same idempotency_key + order_id
// + print keys, and the upstream dedup (pos_idempotency, Pi outbox,
// print_log) collapses them. attemptRef is reset only on successful pay.
interface AttemptKeys {
  order_id: string
  order_idempotency_key: string
  kitchen_print_key: string
  receipt_print_key: string
  pin_idempotency_key: string
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

export function CheckoutPane({
  priced,
  cart,
  claims,
  onBack,
  onDone,
}: {
  priced: PricedCart
  cart: CartState
  claims: { orgId: string; venueId: string; role: string }
  onBack: () => void
  onDone: () => void
}) {
  const [method, setMethod] = useState<CheckoutMethod | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attemptRef = useRef<AttemptKeys>(freshAttempt())
  const connection = useConnectionStatus()

  async function placeOrder(paidMethod: CheckoutMethod): Promise<
    { ok: true; order_id: string; order_label: string } | { ok: false; error: string }
  > {
    const attempt = attemptRef.current
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
      },
    }

    // Pi-first, Server-Action fallback. The Pi enqueues to its outbox and
    // returns synchronously; the Server Action writes through Supabase if
    // the Pi is unreachable.
    const pi = await placeOrderViaPi(payload)
    if (!pi.ok) {
      const fallback = await placeOrderAction({
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
      })
      if (!fallback.ok) return { ok: false, error: fallback.error ?? "place_failed" }
    }

    const order_label = cart.customer_name ?? "#"

    // Fire-and-forget kitchen print. The key is stable across retries so a
    // double-tap doesn't double-print; the Pi's print_log table dedups.
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

    // Customer bon
    void printReceiptViaPi({
      idempotency_key: attempt.receipt_print_key,
      order_id,
      order_label,
      items: priced.items.map((it) => ({
        name: it.menu_item.name,
        qty: it.qty,
        price_cents: it.unit_price_cents + Math.round(it.modifier_total_cents / it.qty),
        btw_rate: btwRateFor(it.menu_item.btw_class),
      })),
      total_excl_cents: priced.total_excl_cents,
      total_btw_cents: priced.total_btw_cents,
      total_incl_cents: priced.total_incl_cents,
      paid_method: paidMethod,
      org_name: "Hop & Bites",
      org_kvk: "12345678",
      org_btw: "NL000000000B01",
    })

    return { ok: true, order_id, order_label }
  }

  if (method === null) {
    const piDown = !connection.pi_ok
    return (
      <>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Hoe afrekenen?</h2>
          <button onClick={onBack} className="text-sm opacity-70 underline">
            Terug
          </button>
        </div>
        {piDown ? (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            Pi-bridge offline — cash-modus actief. PIN beschikbaar zodra
            de bridge weer bereikbaar is.
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <MethodCard
            label="Contant"
            sub="Cash + bon"
            onClick={() => setMethod("cash")}
          />
          <MethodCard
            label="PIN"
            sub={piDown ? "Pi-bridge offline" : "myPOS terminal"}
            disabled={piDown}
            onClick={() => setMethod("pin")}
          />
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </>
    )
  }

  const commonProps = {
    priced,
    busy,
    onPay: async () => {
      if (busy) return // synchronous guard against double-tap
      setBusy(true)
      setError(null)
      const res = await placeOrder(method)
      setBusy(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Reset attempt keys for the next customer.
      attemptRef.current = freshAttempt()
      onDone()
    },
    onBack: () => setMethod(null),
  }

  if (method === "cash") return <CheckoutCash {...commonProps} />
  return (
    <CheckoutPin
      {...commonProps}
      venueAmount={priced.total_incl_cents}
      // Pass the SAME order_id and pin_idempotency_key as the place-order
      // path so the myPOS intent row binds to this attempt's order.
      orderId={attemptRef.current.order_id}
      pinIdempotencyKey={attemptRef.current.pin_idempotency_key}
    />
  )
}

function MethodCard({
  label,
  sub,
  onClick,
  disabled = false,
}: {
  label: string
  sub: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className="min-h-[120px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <div className="text-lg font-semibold">{label}</div>
      <div className="text-sm opacity-70">{sub}</div>
    </button>
  )
}

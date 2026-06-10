"use client"

// Browser client for the Pi-bridge LAN service. Calls go directly to
// https://hopbites.local:3001/... over the local network so the kassa keeps
// running through Supabase outages. Every call has a short timeout — on
// failure the caller falls back to the Server Action which writes
// through Supabase directly.

const PI_BASE = "https://hopbites.local:3001"
const TIMEOUT_MS = 2000

type CallResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

async function call<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<CallResult<T>> {
  const { timeoutMs = TIMEOUT_MS, ...rest } = init
  try {
    const res = await fetch(`${PI_BASE}${path}`, {
      credentials: "include",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
      ...rest,
    })
    if (!res.ok) {
      return { ok: false, error: `pi_${res.status}`, status: res.status }
    }
    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: (err as Error).name === "TimeoutError" ? "pi_timeout" : "pi_unavailable" }
  }
}

export interface PlaceOrderPayload {
  idempotency_key: string
  order_id: string
  org_id: string
  venue_id: string
  customer_label?: string | null
  items: Array<{
    id: string
    menu_item_id: string
    qty: number
    unit_price_cents: number
    btw_class: string
    modifiers: Array<{ id: string; name: string; price_delta_cents: number }>
    note?: string | null
  }>
  totals: { excl_cents: number; btw_cents: number; incl_cents: number }
}

export function placeOrderViaPi(payload: PlaceOrderPayload) {
  return call<{ ok: boolean; queued: boolean; dedup?: boolean }>("/orders/create", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function updateOrderStateViaPi(payload: {
  idempotency_key: string
  order_id: string
  state: "placed" | "preparing" | "ready" | "served" | "voided"
}) {
  return call<{ ok: boolean; queued: boolean }>("/orders/update-state", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function startMyPosViaPi(payload: {
  idempotency_key: string
  amount_cents: number
  order_id: string
}) {
  return call<{ transaction_id: string; status: string; reused?: boolean }>(
    "/mypos/start",
    { method: "POST", body: JSON.stringify(payload) },
  )
}

export function pollMyPosViaPi(transaction_id: string) {
  return call<{ status: string; raw: unknown }>(
    `/mypos/status/${encodeURIComponent(transaction_id)}`,
    { method: "GET" },
  )
}

export interface PrintKitchenPayload {
  idempotency_key: string
  order_id: string
  order_label: string
  items: Array<{ name: string; qty: number; modifiers: string[]; note?: string }>
}

export function printKitchenViaPi(payload: PrintKitchenPayload) {
  return call<{ ok: boolean; dedup?: boolean; soft_error?: string }>(
    "/print/kitchen",
    { method: "POST", body: JSON.stringify(payload) },
  )
}

export interface PrintReceiptPayload {
  idempotency_key: string
  order_id: string
  order_label: string
  items: Array<{ name: string; qty: number; price_cents: number; btw_rate: number }>
  total_excl_cents: number
  total_btw_cents: number
  total_incl_cents: number
  paid_method: "cash" | "pin" | "ideal"
  org_name: string
  org_kvk: string
  org_btw: string
}

export function printReceiptViaPi(payload: PrintReceiptPayload) {
  return call<{ ok: boolean; dedup?: boolean; soft_error?: string }>(
    "/print/receipt",
    { method: "POST", body: JSON.stringify(payload) },
  )
}

export function openDrawerViaPi() {
  return call<{ ok: boolean; soft_error?: string }>("/print/drawer", {
    method: "POST",
    body: "{}",
  })
}

// ---- /admin/operational/* Pi-bridge surface ----

export interface StockUpdatePayload {
  idempotency_key: string
  item_id: string
  set_to?: number | null
  delta?: number
}

export function updateStockViaPi(payload: StockUpdatePayload) {
  return call<{ ok: boolean; item_id: string; stock_qty: number | null }>(
    "/admin/stock/update",
    { method: "POST", body: JSON.stringify(payload) },
  )
}

export interface AvailabilityTogglePayload {
  idempotency_key: string
  item_id: string
  available: boolean | null
}

export function toggleAvailabilityViaPi(payload: AvailabilityTogglePayload) {
  return call<{ ok: boolean; item_id: string; is_available_override: boolean | null }>(
    "/admin/availability/toggle",
    { method: "POST", body: JSON.stringify(payload) },
  )
}

export interface PriceOverridePayload {
  idempotency_key: string
  item_id: string
  price_cents: number | null
  expires_at: string | null
}

export function setPriceOverrideViaPi(payload: PriceOverridePayload) {
  return call<{
    ok: boolean
    item_id: string
    price_override_cents: number | null
    price_override_expires_at: string | null
  }>("/admin/price/override", { method: "POST", body: JSON.stringify(payload) })
}

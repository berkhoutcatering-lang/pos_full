import "server-only"

// Server-side Pi-bridge client. Only used by the Pi deployment (the
// Next.js server and pi-bridge share the same box, so this is a localhost
// call); on Vercel/dev POS_OFFLINE_CACHE_DIR is unset and every helper
// no-ops.

const ENABLED = Boolean(process.env.POS_OFFLINE_CACHE_DIR)
const PI_BASE = process.env.PI_BRIDGE_URL ?? "https://127.0.0.1:3001"
const ADMIN_TOKEN = process.env.PI_BRIDGE_ADMIN_TOKEN

export interface PendingOutboxEntry {
  idempotency_key: string
  operation: string
  table_name: "pos_orders" | "pos_order_state_changes" | string
  payload: unknown
  venue_id: string
  created_at: number
}

export interface MenuUpsertViaPi {
  idempotency_key: string
  id: string
  org_id: string
  venue_id: string
  name: string
  category: string
  base_price_cents: number
  btw_class: string
  station: string
  is_discountable: boolean
  is_active: boolean
}

// Offline menu write: PGlite cache + outbox on the Pi-bridge; synct
// automatisch naar pos_menu_items zodra Supabase weer bereikbaar is.
export async function queueMenuUpsertViaPi(
  payload: MenuUpsertViaPi,
): Promise<{ ok: boolean; error?: string }> {
  if (!ENABLED || !ADMIN_TOKEN) return { ok: false, error: "pi_disabled" }
  try {
    const res = await fetch(`${PI_BASE}/admin/menu/upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    })
    if (!res.ok) return { ok: false, error: `pi_${res.status}` }
    return { ok: true }
  } catch {
    return { ok: false, error: "pi_unreachable" }
  }
}

export async function fetchPendingOutbox(): Promise<PendingOutboxEntry[] | null> {
  if (!ENABLED || !ADMIN_TOKEN) return null
  try {
    const res = await fetch(`${PI_BASE}/admin/outbox/pending`, {
      headers: { "x-admin-token": ADMIN_TOKEN },
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    })
    if (!res.ok) return null
    const body = (await res.json()) as { rows: PendingOutboxEntry[] }
    return body.rows ?? []
  } catch {
    return null
  }
}

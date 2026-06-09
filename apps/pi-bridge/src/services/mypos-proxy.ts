import { config } from "../config.js"
import { piDb } from "../db/outbox.js"
import { logger } from "../utils/logger.js"

// myPOS ePOS REST proxy. The X-Session / X-Partner-Id / X-Application-Id
// triple is read from env (Pi-only) and never bundled to the PWA. Every
// call is idempotent: repeats with the same idempotency_key reuse the
// existing transaction row.

if (typeof window !== "undefined") {
  throw new Error("mypos-proxy must only be loaded server-side")
}

const HEADERS = () => ({
  "X-Session": config.MYPOS_SESSION_SECRET,
  "X-Partner-Id": config.MYPOS_PARTNER_ID,
  "X-Application-Id": config.MYPOS_APP_ID,
  "Content-Type": "application/json",
})

export interface MyPosStartArgs {
  idempotency_key: string
  amount_cents: number
  order_id: string
  venue_id: string
}

export interface MyPosStartResult {
  transaction_id: string
  status: string
  reused?: boolean
}

export async function startMyPosTransaction(
  args: MyPosStartArgs,
): Promise<MyPosStartResult> {
  const now = Date.now()

  const existing = piDb
    .prepare(
      "SELECT transaction_id, status FROM mypos_intents WHERE idempotency_key = ?",
    )
    .get(args.idempotency_key) as
    | { transaction_id: string | null; status: string }
    | undefined
  if (existing && existing.transaction_id) {
    return { transaction_id: existing.transaction_id, status: existing.status, reused: true }
  }

  // Reserve a row pre-call so a retried request hitting myPOS twice still
  // collapses to one intent (myPOS will see the same Idempotency-Key and
  // refuse to double-charge).
  if (!existing) {
    piDb
      .prepare(
        `INSERT INTO mypos_intents (idempotency_key, transaction_id, status, amount_cents, order_id, venue_id, created_at, updated_at)
         VALUES (?, NULL, 'pending', ?, ?, ?, ?, ?)`,
      )
      .run(args.idempotency_key, args.amount_cents, args.order_id, args.venue_id, now, now)
  }

  const response = await fetch(`${config.MYPOS_BASE}/transactions`, {
    method: "POST",
    headers: {
      ...HEADERS(),
      "Idempotency-Key": args.idempotency_key,
    },
    body: JSON.stringify({
      amount: args.amount_cents,
      currency: "EUR",
      reference: args.order_id,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    logger.error({ status: response.status, text }, "myPOS start failed")
    throw new Error(`myPOS start failed: ${response.status}`)
  }

  const result = (await response.json()) as { transaction_id: string; status: string }

  piDb
    .prepare(
      `UPDATE mypos_intents
       SET transaction_id = ?, status = ?, updated_at = ?
       WHERE idempotency_key = ?`,
    )
    .run(result.transaction_id, result.status, Date.now(), args.idempotency_key)

  return result
}

export async function pollMyPosStatus(
  transaction_id: string,
): Promise<{ status: string; raw: unknown }> {
  const response = await fetch(`${config.MYPOS_BASE}/transactions/${transaction_id}`, {
    method: "GET",
    headers: HEADERS(),
  })
  if (!response.ok) throw new Error(`myPOS status failed: ${response.status}`)
  const data = (await response.json()) as { status: string }

  piDb
    .prepare(
      "UPDATE mypos_intents SET status = ?, updated_at = ? WHERE transaction_id = ?",
    )
    .run(data.status, Date.now(), transaction_id)

  return { status: data.status, raw: data }
}

export async function refundMyPos(
  transaction_id: string,
  amount_cents: number,
  idempotency_key: string,
  venue_id: string,
): Promise<{ refund_id: string; reused?: boolean }> {
  // Phase 2 deferred P1 fix — local refund-intent mirror so retries past
  // the myPOS Idempotency-Key window (~24h) still collapse to one refund.
  const existing = piDb
    .prepare(
      "SELECT refund_id FROM mypos_refund_intents WHERE idempotency_key = ?",
    )
    .get(idempotency_key) as { refund_id: string | null } | undefined
  if (existing?.refund_id) {
    return { refund_id: existing.refund_id, reused: true }
  }

  const now = Date.now()
  if (!existing) {
    piDb
      .prepare(
        `INSERT INTO mypos_refund_intents (idempotency_key, refund_id, transaction_id, amount_cents, venue_id, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(idempotency_key, transaction_id, amount_cents, venue_id, now, now)
  }

  const response = await fetch(
    `${config.MYPOS_BASE}/transactions/${transaction_id}/refund`,
    {
      method: "POST",
      headers: {
        ...HEADERS(),
        "Idempotency-Key": idempotency_key,
      },
      body: JSON.stringify({ amount: amount_cents }),
    },
  )
  if (!response.ok) throw new Error(`myPOS refund failed: ${response.status}`)
  const result = (await response.json()) as { refund_id: string }

  piDb
    .prepare(
      "UPDATE mypos_refund_intents SET refund_id = ?, updated_at = ? WHERE idempotency_key = ?",
    )
    .run(result.refund_id, Date.now(), idempotency_key)

  return result
}

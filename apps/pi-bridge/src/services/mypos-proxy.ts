import {
  MyPOSGateway,
  type MerchantClient,
} from "mypos-api-gateway"
import { config } from "../config.js"
import { piDb } from "../db/outbox.js"
import { logger } from "../utils/logger.js"
import { writeAuditEvent } from "./audit-log.js"

// myPOS PIN payments over the ePOS API.
//
// The Pi calls the myPOS API Gateway, myPOS pushes the amount to the terminal,
// and the terminal authorises the card over its own SIM. The Pi therefore needs
// an uplink, but only for a handful of small HTTPS calls — not for the payment
// traffic itself.
//
// The SDK owns the dual-token dance (OAuth 1 h, session 5 min, refreshed
// transparently). Everything transport-independent lives here: the SQLite
// intent mirror that makes retries idempotent, status normalisation, and the
// audit write.
//
// Driving the terminal directly over the LAN was investigated at length and
// does not work — see raspberry-pos-os/README.md.

if (typeof window !== "undefined") {
  throw new Error("mypos-proxy must only be loaded server-side")
}

export type NormalizedStatus = "pending" | "approved" | "declined" | "failed"

export interface MyPosStartArgs {
  idempotency_key: string
  amount_cents: number
  order_id: string
  venue_id: string
  actor_terminal_id: string
}

export interface MyPosStartResult {
  /** Handle the caller polls with — myPOS' payment id. */
  transaction_id: string
  status: NormalizedStatus
  reused?: boolean
}

interface IntentRow {
  idempotency_key: string
  transaction_id: string | null
  status: string
  amount_cents: number
  order_id: string
  venue_id: string
  actor_terminal_id: string | null
  captured_at: number | null
  status_code: string | null
  last_error: string | null
}

const APP_NAME = "HopBitesPOS"
const APP_VERSION = "1.0.0"

// Built lazily so the bridge boots fine with MYPOS_TRANSPORT=off.
let cachedClient: MerchantClient | null = null

function client(): MerchantClient {
  if (cachedClient) return cachedClient
  if (config.MYPOS_TRANSPORT !== "cloud") throw new Error("mypos_disabled")

  const gateway = new MyPOSGateway({
    gatewayUrl: config.MYPOS_GATEWAY_URL,
    integration: {
      clientId: config.MYPOS_INTEGRATION_CLIENT_ID!,
      clientSecret: config.MYPOS_INTEGRATION_CLIENT_SECRET!,
    },
    partnerId: config.MYPOS_PARTNER_ID!,
    applicationId: config.MYPOS_APPLICATION_ID!,
  })

  cachedClient = gateway.createClient({
    clientId: config.MYPOS_MERCHANT_CLIENT_ID!,
    clientSecret: config.MYPOS_MERCHANT_CLIENT_SECRET!,
  })
  return cachedClient
}

/**
 * myPOS returns free-form status strings. Map them onto our vocabulary and log
 * anything unrecognised rather than guessing — an unknown status must never
 * silently read as "approved".
 */
function normalizeStatus(raw: string): NormalizedStatus {
  const s = raw.trim().toLowerCase()
  if (["approved", "captured", "completed", "paid", "success", "successful"].includes(s)) {
    return "approved"
  }
  if (["declined", "failed", "canceled", "cancelled", "error", "expired", "rejected"].includes(s)) {
    return "declined"
  }
  if (["pending", "created", "processing", "inprogress", "in_progress", "sent"].includes(s)) {
    return "pending"
  }
  logger.warn({ status: raw }, "myPOS returned an unrecognised status; treating as pending")
  return "pending"
}

function findIntent(handle: string): IntentRow | undefined {
  return piDb
    .prepare(
      `SELECT * FROM mypos_intents
       WHERE idempotency_key = ? OR transaction_id = ?
       LIMIT 1`,
    )
    .get(handle, handle) as IntentRow | undefined
}

function updateIntent(
  idempotency_key: string,
  patch: {
    transaction_id?: string | null
    status?: string
    status_code?: string | null
    last_error?: string | null
  },
) {
  const sets: string[] = []
  const values: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = ?`)
    values.push(v)
  }
  sets.push("updated_at = ?")
  values.push(Date.now(), idempotency_key)
  piDb
    .prepare(`UPDATE mypos_intents SET ${sets.join(", ")} WHERE idempotency_key = ?`)
    .run(...values)
}

/**
 * Write payment.captured exactly once, at the moment myPOS reports approval.
 * This used to fire when the transaction was *started*, so every abandoned or
 * declined PIN landed in the audit log as a completed payment.
 */
async function captureOnce(idempotency_key: string) {
  const row = findIntent(idempotency_key)
  if (!row || row.captured_at) return

  const claimed = piDb
    .prepare(
      "UPDATE mypos_intents SET captured_at = ? WHERE idempotency_key = ? AND captured_at IS NULL",
    )
    .run(Date.now(), idempotency_key)
  // Lost the race with a concurrent poll — the other one writes the event.
  if (claimed.changes === 0) return

  await writeAuditEvent({
    event_type: "payment.captured",
    payload: {
      order_id: row.order_id,
      amount_cents: row.amount_cents,
      method: "pin",
      mypos_transaction_id: row.transaction_id ?? row.idempotency_key,
    },
    actor_terminal_id: row.actor_terminal_id ?? "unknown",
    venue_id: row.venue_id,
  })
}

export async function startMyPosTransaction(
  args: MyPosStartArgs,
): Promise<MyPosStartResult> {
  if (config.MYPOS_TRANSPORT === "off") throw new Error("mypos_disabled")

  const existing = findIntent(args.idempotency_key)
  if (existing) {
    return {
      transaction_id: existing.transaction_id ?? existing.idempotency_key,
      status: existing.status as NormalizedStatus,
      reused: true,
    }
  }

  const now = Date.now()
  piDb
    .prepare(
      `INSERT INTO mypos_intents
         (idempotency_key, transaction_id, status, amount_cents, order_id, venue_id,
          actor_terminal_id, created_at, updated_at)
       VALUES (?, NULL, 'pending', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      args.idempotency_key,
      args.amount_cents,
      args.order_id,
      args.venue_id,
      args.actor_terminal_id,
      now,
      now,
    )

  const result = await client().epos.payments.create({
    referenceNumber: args.idempotency_key,
    amount: { value: args.amount_cents, currencyCode: "EUR", tip: 0 },
    description: `Order ${args.order_id}`,
    terminalId: config.MYPOS_TID!,
    appName: APP_NAME,
    appVersion: APP_VERSION,
    operatorCode: config.MYPOS_OPERATOR_CODE,
  })

  if (!result.success) {
    logger.error(
      { status: result.status, message: result.statusMessage },
      "myPOS payment create failed",
    )
    updateIntent(args.idempotency_key, {
      status: "failed",
      last_error: `${result.status}: ${result.statusMessage}`,
    })
    throw new Error(`mypos_start_failed_${result.status}`)
  }

  const status = normalizeStatus(result.status)
  updateIntent(args.idempotency_key, {
    transaction_id: result.paymentId,
    status,
    status_code: result.status,
  })
  if (status === "approved") await captureOnce(args.idempotency_key)

  return { transaction_id: result.paymentId, status }
}

export async function pollMyPosStatus(
  handle: string,
): Promise<{ status: NormalizedStatus; code: string | null; raw: unknown }> {
  const row = findIntent(handle)
  if (!row) throw new Error("mypos_unknown_transaction")

  // Already final — don't keep asking myPOS about a closed payment.
  if (row.status === "approved" || row.status === "declined" || row.status === "failed") {
    return {
      status: row.status as NormalizedStatus,
      code: row.status_code,
      raw: { status: row.status, error: row.last_error },
    }
  }

  const paymentId = row.transaction_id
  if (!paymentId) return { status: "pending", code: null, raw: {} }

  const result = await client().epos.payments.get(paymentId)
  if (!result.success) {
    // A failed poll is not a failed payment — the customer may still be paying.
    logger.warn(
      { status: result.status, message: result.statusMessage },
      "myPOS status poll failed",
    )
    return { status: "pending", code: null, raw: { error: result.statusMessage } }
  }

  const status = normalizeStatus(result.status)
  updateIntent(row.idempotency_key, { status, status_code: result.status })
  if (status === "approved") await captureOnce(row.idempotency_key)

  return { status, code: result.status, raw: result }
}

export async function refundMyPos(
  transaction_id: string,
  amount_cents: number,
  idempotency_key: string,
  venue_id: string,
): Promise<{ refund_id: string; reused?: boolean }> {
  if (config.MYPOS_TRANSPORT !== "cloud") throw new Error("mypos_disabled")

  // Local refund-intent mirror so retries past myPOS' own dedup window still
  // collapse to one refund.
  const existing = piDb
    .prepare("SELECT refund_id FROM mypos_refund_intents WHERE idempotency_key = ?")
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

  const result = await client().epos.payments.refund({
    amount: { value: amount_cents, currencyCode: "EUR", tip: 0 },
    description: `Refund ${transaction_id}`,
    terminalId: config.MYPOS_TID!,
    appName: APP_NAME,
    appVersion: APP_VERSION,
  })

  if (!result.success) {
    logger.error(
      { status: result.status, message: result.statusMessage },
      "myPOS refund failed",
    )
    throw new Error(`mypos_refund_failed_${result.status}`)
  }

  // The SDK's refund response shape varies by terminal model; fall back to the
  // idempotency key so the caller always has something to reconcile against.
  const refundId =
    (result as unknown as { paymentId?: string; refundId?: string }).refundId ??
    (result as unknown as { paymentId?: string }).paymentId ??
    idempotency_key

  piDb
    .prepare(
      "UPDATE mypos_refund_intents SET refund_id = ?, updated_at = ? WHERE idempotency_key = ?",
    )
    .run(refundId, Date.now(), idempotency_key)

  return { refund_id: refundId }
}

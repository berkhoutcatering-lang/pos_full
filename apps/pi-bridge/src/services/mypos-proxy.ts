import {
  MyPOSGateway,
  type MerchantClient,
  type PaymentInfoItem,
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

/**
 * `unresolved` is the honest answer to "did the card get charged?" when the
 * uplink dropped between our request and myPOS' answer. It is never a silent
 * pending: the kassa must stop and let the operator look at the terminal,
 * because guessing wrong here either charges twice or gives food away.
 */
export type NormalizedStatus =
  | "pending"
  | "approved"
  | "declined"
  | "failed"
  | "unresolved"

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
  /** Set on failed/unresolved: what the operator has to do about it. */
  message?: string
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
  created_at: number
}

const APP_NAME = "HopBitesPOS"
const APP_VERSION = "1.0.0"

/**
 * How long a payment may sit on `pending` before the kassa is told to look at
 * the terminal instead of waiting. myPOS expires its own request well after
 * this; three minutes is "the customer has walked off or the app crashed".
 */
const STALE_PENDING_MS = 3 * 60_000

/** Page size and page budget for reference-number reconciliation. */
const RECONCILE_PAGE_SIZE = 50
const RECONCILE_PAGES = 2

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

/**
 * Operator-facing text for a refused create. 403 gets its own line because it
 * is the one failure that is not about this transaction at all: myPOS accepts
 * the credentials but the terminal is not cleared for ePOS payments.
 */
function startFailureText(status: number, statusMessage: string): string {
  if (status === 403) {
    return "myPOS staat deze terminal (nog) geen ePOS-betalingen toe — reken contant af en meld dit."
  }
  if (status === 404) {
    return "myPOS kent dit terminal-ID niet — controleer MYPOS_TID op de Pi."
  }
  return `myPOS weigerde de betaling (${status}: ${statusMessage}) — reken contant af.`
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

/**
 * Drop an intent so the same idempotency key may start a fresh payment. Only
 * ever called once we have proof that myPOS holds nothing under this key.
 */
function dropIntent(idempotency_key: string) {
  piDb.prepare("DELETE FROM mypos_intents WHERE idempotency_key = ?").run(idempotency_key)
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

type Reconciled =
  | { outcome: "found"; status: NormalizedStatus; paymentId: string; code: string }
  /** myPOS demonstrably holds no payment under this reference. */
  | { outcome: "absent" }
  /** We could not ask — still unresolved, try again later. */
  | { outcome: "unknown" }

/**
 * Answer "does myPOS know this reference?" by listing the terminal's payments
 * and matching on our idempotency key, which we send as `referenceNumber`.
 *
 * This is the recovery path for a create whose answer we never saw. Without it
 * a single dropped response leaves the order permanently unpayable by card:
 * the intent row is there, so every retry with the same key gets handed back
 * the same dead row, and no key means no way to ask myPOS what happened.
 *
 * The list endpoint carries no timestamp and myPOS does not document its sort
 * order, so we read both ends: the first pages and the last ones. The payment
 * we are looking for is at most minutes old, so it has to sit at whichever end
 * is the newest — absent from both ends means absent, however myPOS sorts. If
 * a page cannot be fetched we say `unknown` rather than claim an absence we
 * cannot back up.
 */
async function reconcileIntent(row: IntentRow): Promise<Reconciled> {
  const seen: PaymentInfoItem[] = []
  let totalPages = 1

  const readPage = async (page: number): Promise<boolean> => {
    const listed = await client().epos.payments.list({
      terminalId: config.MYPOS_TID!,
      page,
      size: RECONCILE_PAGE_SIZE,
    })
    if (!listed.success) {
      logger.warn(
        { status: listed.status, message: listed.statusMessage, page },
        "myPOS reconcile could not reach the gateway",
      )
      return false
    }
    totalPages = listed.totalPages ?? 1
    seen.push(...(listed.items ?? []))
    return true
  }

  for (let page = 1; page <= RECONCILE_PAGES; page++) {
    if (!(await readPage(page))) return { outcome: "unknown" }
    if (page >= totalPages) break
  }

  const tailStart = Math.max(totalPages - RECONCILE_PAGES + 1, RECONCILE_PAGES + 1)
  for (let page = tailStart; page <= totalPages; page++) {
    if (!(await readPage(page))) return { outcome: "unknown" }
  }

  const match = seen.find((p) => p.referenceNumber === row.idempotency_key)
  if (!match) return { outcome: "absent" }

  return {
    outcome: "found",
    status: normalizeStatus(match.status),
    paymentId: match.requestId,
    code: match.status,
  }
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

/**
 * What to hand back for an idempotency key we have seen before — or `null` if
 * the previous attempt provably never reached myPOS, in which case the caller
 * may start over under the same key.
 */
async function settleExisting(row: IntentRow): Promise<MyPosStartResult | null> {
  const handle = row.transaction_id ?? row.idempotency_key

  // A create that was refused outright (validation, 403) created nothing, so a
  // retry is safe and is what the operator is asking for by tapping again.
  if (row.status === "failed" && !row.transaction_id) return null

  if (row.status === "unresolved") {
    const found = await reconcileIntent(row)
    if (found.outcome === "absent") return null
    if (found.outcome === "unknown") {
      return {
        transaction_id: handle,
        status: "unresolved",
        reused: true,
        message:
          "Onbekend of deze betaling bij myPOS is aangekomen — controleer de terminal voor je opnieuw aanslaat.",
      }
    }
    updateIntent(row.idempotency_key, {
      transaction_id: found.paymentId,
      status: found.status,
      status_code: found.code,
      last_error: null,
    })
    if (found.status === "approved") await captureOnce(row.idempotency_key)
    return { transaction_id: found.paymentId, status: found.status, reused: true }
  }

  return {
    transaction_id: handle,
    status: row.status as NormalizedStatus,
    reused: true,
  }
}

export async function startMyPosTransaction(
  args: MyPosStartArgs,
): Promise<MyPosStartResult> {
  if (config.MYPOS_TRANSPORT === "off") throw new Error("mypos_disabled")

  const existing = findIntent(args.idempotency_key)
  if (existing) {
    const settled = await settleExisting(existing)
    if (settled) return settled
    // Proven absent at myPOS — the key is free to be used for a real attempt.
    dropIntent(existing.idempotency_key)
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

  // The reference number is our idempotency key on purpose: it is the only
  // field myPOS echoes back in the payments list, so it doubles as the handle
  // for reconciliation when we lose the answer to this very call.
  let result: Awaited<ReturnType<MerchantClient["epos"]["payments"]["create"]>>
  try {
    result = await client().epos.payments.create({
      referenceNumber: args.idempotency_key,
      amount: { value: args.amount_cents, currencyCode: "EUR", tip: 0 },
      description: `Order ${args.order_id}`,
      terminalId: config.MYPOS_TID!,
      appName: APP_NAME,
      appVersion: APP_VERSION,
      operatorCode: config.MYPOS_OPERATOR_CODE,
    })
  } catch (err) {
    // Authentication runs before the payment is posted, so a token failure
    // means nothing was created — say so instead of leaving it in doubt.
    const authFailure = (err as Error).name === "GatewayAuthError"
    const message = (err as Error).message
    logger.error({ err: message, authFailure }, "myPOS payment create threw")
    updateIntent(args.idempotency_key, {
      status: authFailure ? "failed" : "unresolved",
      last_error: message,
    })
    return {
      transaction_id: args.idempotency_key,
      status: authFailure ? "failed" : "unresolved",
      message: authFailure
        ? "myPOS weigerde de aanmelding — controleer de myPOS-sleutels op de Pi."
        : "Geen antwoord van myPOS — controleer de terminal voor je opnieuw aanslaat.",
    }
  }

  if (!result.success) {
    logger.error(
      { status: result.status, message: result.statusMessage },
      "myPOS payment create failed",
    )
    // A network error (-1), a timeout or a 5xx leaves it genuinely open
    // whether myPOS armed the terminal. Anything else is a refusal, and a
    // refusal creates nothing.
    const ambiguous =
      result.status === -1 || result.status === 408 || result.status >= 500
    updateIntent(args.idempotency_key, {
      status: ambiguous ? "unresolved" : "failed",
      status_code: String(result.status),
      last_error: `${result.status}: ${result.statusMessage}`,
    })
    return {
      transaction_id: args.idempotency_key,
      status: ambiguous ? "unresolved" : "failed",
      message: ambiguous
        ? "Geen antwoord van myPOS — controleer de terminal voor je opnieuw aanslaat."
        : startFailureText(result.status, result.statusMessage),
    }
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

export interface MyPosPollResult {
  status: NormalizedStatus
  code: string | null
  raw: unknown
  /** Pending for so long that waiting is no longer the right thing to do. */
  stale?: boolean
  message?: string
}

export async function pollMyPosStatus(handle: string): Promise<MyPosPollResult> {
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

  // The uplink was down when we started this one. Every poll is a chance to
  // find out what actually happened, so the kassa recovers by itself once the
  // connection is back instead of needing a restart.
  if (row.status === "unresolved") {
    const found = await reconcileIntent(row)
    if (found.outcome === "found") {
      updateIntent(row.idempotency_key, {
        transaction_id: found.paymentId,
        status: found.status,
        status_code: found.code,
        last_error: null,
      })
      if (found.status === "approved") await captureOnce(row.idempotency_key)
      return { status: found.status, code: found.code, raw: found }
    }
    if (found.outcome === "absent") {
      // Nothing was ever created, so nothing can have been charged. Free the
      // key; the next tap on "opnieuw proberen" starts a real payment.
      dropIntent(row.idempotency_key)
      return {
        status: "failed",
        code: row.status_code,
        raw: { reconciled: "absent" },
        message: "De betaling is myPOS nooit bereikt — probeer opnieuw of reken contant af.",
      }
    }
    return {
      status: "unresolved",
      code: row.status_code,
      raw: { reconciled: "unknown", error: row.last_error },
      message:
        "Nog steeds geen verbinding met myPOS — controleer de terminal voor je opnieuw aanslaat.",
    }
  }

  const stale = Date.now() - row.created_at > STALE_PENDING_MS
  const paymentId = row.transaction_id
  if (!paymentId) return { status: "pending", code: null, raw: {}, stale }

  const result = await client().epos.payments.get(paymentId)
  if (!result.success) {
    // A failed poll is not a failed payment — the customer may still be paying.
    logger.warn(
      { status: result.status, message: result.statusMessage },
      "myPOS status poll failed",
    )
    return {
      status: "pending",
      code: null,
      raw: { error: result.statusMessage },
      stale,
    }
  }

  const status = normalizeStatus(result.status)
  updateIntent(row.idempotency_key, { status, status_code: result.status })
  if (status === "approved") await captureOnce(row.idempotency_key)

  return {
    status,
    code: result.status,
    raw: result,
    stale: status === "pending" ? stale : false,
    message:
      status === "pending" && stale
        ? "De terminal reageert al een tijd niet — kijk op de terminal wat er staat."
        : undefined,
  }
}

/**
 * Take the amount off the terminal when the operator gives up. Without this an
 * abandoned PIN stays armed: the customer taps minutes later, the card is
 * charged, and the order has meanwhile been booked as cash.
 */
export async function cancelMyPosTransaction(
  handle: string,
): Promise<{ cancelled: boolean; status: NormalizedStatus; message?: string }> {
  const row = findIntent(handle)
  if (!row) throw new Error("mypos_unknown_transaction")

  if (row.status === "approved") {
    return {
      cancelled: false,
      status: "approved",
      message: "Al goedgekeurd — annuleren kan niet meer, gebruik een refund.",
    }
  }
  if (!row.transaction_id) {
    dropIntent(row.idempotency_key)
    return { cancelled: true, status: "failed" }
  }

  const result = await client().epos.payments.cancel(row.transaction_id)
  if (!result.success) {
    logger.warn(
      { status: result.status, message: result.statusMessage },
      "myPOS cancel failed",
    )
    return {
      cancelled: false,
      status: row.status as NormalizedStatus,
      message: "Annuleren lukte niet — controleer de terminal.",
    }
  }

  updateIntent(row.idempotency_key, { status: "declined", status_code: "cancelled" })
  return { cancelled: true, status: "declined" }
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

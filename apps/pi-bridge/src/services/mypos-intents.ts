import { piDb } from "../db/outbox.js"
import { writeAuditEvent } from "./audit-log.js"

/**
 * The SQLite intent mirror behind every PIN payment, shared by both
 * transports. It is what makes a retry idempotent: the kassa may send the same
 * ULID again after a dropped connection, and we hand back what we already know
 * instead of arming the terminal twice.
 */

/**
 * `unresolved` is the honest answer to "did the card get charged?" when the
 * connection dropped between our request and the answer. It is never a silent
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
  /** Handle the caller polls with. */
  transaction_id: string
  status: NormalizedStatus
  reused?: boolean
  /** Set on failed/unresolved: what the operator has to do about it. */
  message?: string
}

export interface IntentRow {
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
  /** Bongegevens van de terminal-app, als JSON. */
  receipt_json: string | null
  created_at: number
}

/**
 * How long a payment may sit on `pending` before the kassa is told to look at
 * the terminal instead of waiting. Three minutes is "the customer has walked
 * off or the app crashed".
 */
export const STALE_PENDING_MS = 3 * 60_000

export function findIntent(handle: string): IntentRow | undefined {
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
 * ever called once we have proof that nothing is pending on the terminal.
 */
export function dropIntent(idempotency_key: string) {
  piDb.prepare("DELETE FROM mypos_intents WHERE idempotency_key = ?").run(idempotency_key)
}

export function insertIntent(args: MyPosStartArgs) {
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
}

export function updateIntent(
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
 * Write payment.captured exactly once, at the moment the terminal reports
 * approval. It must not fire when a payment is merely *started*, or every
 * abandoned or declined PIN lands in the audit log as a completed payment.
 */
export async function captureOnce(idempotency_key: string) {
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

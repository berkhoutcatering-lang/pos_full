import Database from "better-sqlite3"
import { config } from "../config.js"
import { logger } from "../utils/logger.js"

// SQLite — durable through Pi reboots via WAL mode. Houses the outbox,
// myPOS intent dedup table, pair codes, paired tablets, and the JTI
// revocation list.

if (typeof window !== "undefined") {
  throw new Error("db/outbox must only be loaded server-side")
}

export const piDb = new Database(config.SQLITE_PATH)
piDb.pragma("journal_mode = WAL")
piDb.pragma("synchronous = NORMAL")
piDb.pragma("foreign_keys = ON")

piDb.exec(`
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT NOT NULL UNIQUE,
    operation TEXT NOT NULL,
    table_name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    venue_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER DEFAULT 0,
    next_retry_at INTEGER,
    delivered_at INTEGER,
    last_error TEXT
  );

  CREATE INDEX IF NOT EXISTS outbox_undelivered
    ON outbox(delivered_at, next_retry_at)
    WHERE delivered_at IS NULL;

  CREATE TABLE IF NOT EXISTS outbox_failed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_id INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    table_name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    venue_id TEXT NOT NULL,
    failed_at INTEGER NOT NULL,
    final_error TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mypos_intents (
    idempotency_key TEXT PRIMARY KEY,
    transaction_id TEXT,
    status TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    order_id TEXT NOT NULL,
    venue_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS paired_tablets (
    terminal_id TEXT PRIMARY KEY,
    venue_id TEXT NOT NULL,
    role TEXT NOT NULL,
    paired_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    jti TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS revoked_jti (
    jti TEXT PRIMARY KEY,
    revoked_at INTEGER NOT NULL,
    reason TEXT
  );

  CREATE TABLE IF NOT EXISTS pair_codes (
    code TEXT PRIMARY KEY,
    venue_id TEXT NOT NULL,
    role TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );

  -- Print idempotency log — 24h dedup so a retried /print/* call doesn't
  -- fire the printer twice.
  CREATE TABLE IF NOT EXISTS print_log (
    idempotency_key TEXT PRIMARY KEY,
    kind TEXT NOT NULL,           -- 'kitchen' | 'customer'
    order_id TEXT NOT NULL,
    printed_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS print_log_expires ON print_log(expires_at);

  -- Volgnummers per venue per dag — de Pi is dé uitgever zodat het
  -- afroepnummer ook zonder internet bestaat; de cloud-trigger respecteert
  -- een aangeleverde daily_seq.
  CREATE TABLE IF NOT EXISTS queue_counters (
    venue_id TEXT NOT NULL,
    day TEXT NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY (venue_id, day)
  );

  -- Refund-intent mirror — Phase 2 deferred P1. The myPOS API has its
  -- own Idempotency-Key dedup window (~24h), but a delayed retry past
  -- that window could fire a second refund. We mirror locally with no
  -- expiry so retries always collapse.
  CREATE TABLE IF NOT EXISTS mypos_refund_intents (
    idempotency_key TEXT PRIMARY KEY,
    refund_id TEXT,
    transaction_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    venue_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS mypos_refund_intents_txn ON mypos_refund_intents(transaction_id);
`)

export interface OutboxRow {
  id: number
  idempotency_key: string
  operation: string
  table_name: string
  payload_json: string
  venue_id: string
  created_at: number
  attempts: number
  next_retry_at: number | null
  delivered_at: number | null
  last_error: string | null
}

const MAX_OUTBOX_ROWS = 10_000
const MAX_ATTEMPTS = 10

export function enqueueOutbox(args: {
  idempotency_key: string
  operation: "insert" | "upsert"
  table_name: string
  payload: unknown
  venue_id: string
}): { enqueued: boolean; reason?: string } {
  const count = piDb
    .prepare("SELECT count(*) AS c FROM outbox WHERE delivered_at IS NULL")
    .get() as { c: number }
  if (count.c >= MAX_OUTBOX_ROWS) {
    logger.error({ count: count.c }, "outbox full — refusing new mutation")
    return { enqueued: false, reason: "outbox_full" }
  }
  try {
    piDb
      .prepare(
        `INSERT INTO outbox (idempotency_key, operation, table_name, payload_json, venue_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        args.idempotency_key,
        args.operation,
        args.table_name,
        JSON.stringify(args.payload),
        args.venue_id,
        Date.now(),
      )
    return { enqueued: true }
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      // Duplicate — already enqueued, treat as success (idempotent)
      return { enqueued: true, reason: "duplicate" }
    }
    throw err
  }
}

// Europe/Amsterdam dag-string zodat de teller om middernacht NL reset.
function amsterdamDay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date())
}

export function nextQueueNumber(venueId: string): number {
  const row = piDb
    .prepare(
      `INSERT INTO queue_counters (venue_id, day, seq) VALUES (?, ?, 1)
       ON CONFLICT (venue_id, day) DO UPDATE SET seq = seq + 1
       RETURNING seq`,
    )
    .get(venueId, amsterdamDay()) as { seq: number }
  return row.seq
}

// Bij een idempotente retry van /orders/create moet hetzelfde volgnummer
// terugkomen — haal het uit de eerder ge-enqueuede payload.
export function getOutboxPayload(idempotencyKey: string): Record<string, unknown> | null {
  const row = piDb
    .prepare(`SELECT payload_json FROM outbox WHERE idempotency_key = ?`)
    .get(idempotencyKey) as { payload_json: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.payload_json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function getPendingOutbox(limit = 50): OutboxRow[] {
  return piDb
    .prepare(
      `SELECT * FROM outbox
       WHERE delivered_at IS NULL
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(Date.now(), limit) as OutboxRow[]
}

export function markDelivered(id: number) {
  piDb.prepare("UPDATE outbox SET delivered_at = ? WHERE id = ?").run(Date.now(), id)
}

export function markFailed(row: OutboxRow, error: string) {
  const newAttempts = row.attempts + 1
  if (newAttempts >= MAX_ATTEMPTS) {
    // Poison pill — move to outbox_failed
    const tx = piDb.transaction(() => {
      piDb
        .prepare(
          `INSERT INTO outbox_failed (original_id, idempotency_key, operation, table_name, payload_json, venue_id, failed_at, final_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.idempotency_key,
          row.operation,
          row.table_name,
          row.payload_json,
          row.venue_id,
          Date.now(),
          error,
        )
      piDb.prepare("DELETE FROM outbox WHERE id = ?").run(row.id)
    })
    tx()
    logger.error(
      { id: row.id, idempotency_key: row.idempotency_key, error },
      "outbox poison pill moved to outbox_failed",
    )
  } else {
    const backoff = Math.min(2000 * Math.pow(2, row.attempts), 5 * 60_000)
    piDb
      .prepare(
        `UPDATE outbox SET attempts = ?, next_retry_at = ?, last_error = ?
         WHERE id = ?`,
      )
      .run(newAttempts, Date.now() + backoff, error, row.id)
  }
}

const PRINT_DEDUP_TTL_MS = 24 * 60 * 60 * 1000

export function checkAndMarkPrint(args: {
  idempotency_key: string
  kind: "kitchen" | "customer"
  order_id: string
}): { already_printed: boolean } {
  const now = Date.now()
  // Garbage-collect expired rows opportunistically.
  piDb.prepare("DELETE FROM print_log WHERE expires_at < ?").run(now)
  try {
    piDb
      .prepare(
        `INSERT INTO print_log (idempotency_key, kind, order_id, printed_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(args.idempotency_key, args.kind, args.order_id, now, now + PRINT_DEDUP_TTL_MS)
    return { already_printed: false }
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e?.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      return { already_printed: true }
    }
    throw err
  }
}

export function outboxCounts(): { pending: number; failed: number } {
  const pending = (piDb
    .prepare("SELECT count(*) AS c FROM outbox WHERE delivered_at IS NULL")
    .get() as { c: number }).c
  const failed = (piDb.prepare("SELECT count(*) AS c FROM outbox_failed").get() as { c: number }).c
  return { pending, failed }
}

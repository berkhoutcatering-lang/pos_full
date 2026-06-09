import { supabaseAdmin } from "../services/audit-log.js"
import { config } from "../config.js"
import { getPendingOutbox, markDelivered, markFailed } from "../db/outbox.js"
import { logger } from "../utils/logger.js"

// Drains the outbox to Supabase. Order matters: enqueue THEN deliver, so
// the kassa is always ahead of the upstream. Idempotency keys collapse
// duplicates upstream so retries are safe.

async function flushOnce() {
  if (config.SIMULATE_SUPABASE_OUTAGE) return
  const pending = getPendingOutbox(50)
  if (pending.length === 0) return

  for (const row of pending) {
    try {
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>
      // P0-1 defence-in-depth: refuse to flush any row whose org_id does
      // not match this Pi's configured ORG_ID. Service-role bypasses RLS,
      // so this is the last guard before a forged row hits Supabase.
      if (
        typeof payload.org_id === "string" &&
        payload.org_id !== config.ORG_ID
      ) {
        markFailed(row, "org_id_mismatch")
        logger.error(
          { id: row.id, payload_org: payload.org_id, pi_org: config.ORG_ID },
          "outbox row refused: org_id mismatch",
        )
        continue
      }
      if (row.operation === "upsert") {
        const { error } = await supabaseAdmin
          .from(row.table_name)
          .upsert(payload, { onConflict: "idempotency_key", ignoreDuplicates: false })
        if (error) throw error
      } else if (row.operation === "insert") {
        const { error } = await supabaseAdmin.from(row.table_name).insert(payload)
        // 23505 = unique_violation; idempotent retries land here, treat as success.
        if (error && error.code !== "23505") throw error
      } else {
        throw new Error(`unknown operation ${row.operation}`)
      }
      markDelivered(row.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      markFailed(row, msg)
      logger.warn({ id: row.id, err: msg }, "outbox flush failed; will retry")
    }
  }
}

export function startOutboxFlushWorker() {
  setInterval(() => {
    flushOnce().catch((err) => logger.error({ err }, "outbox flush worker crashed"))
  }, 2000)
  logger.info("outbox flush worker started")
}

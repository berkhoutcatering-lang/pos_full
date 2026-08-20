import { supabaseAdmin } from "../services/audit-log.js"
import { describeError } from "../utils/describe-error.js"
import { UUID_RE } from "../utils/uuid.js"
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
      // Tablets die vóór deze fix gekoppeld zijn dragen een ULID als
      // terminal_id, en dat past niet in een uuid-kolom. Liever de herkomst
      // kwijt dan de bestelling: zonder dit blijft een betaalde bon eeuwig
      // hangen en staat hij nergens in de boeken.
      if (typeof payload.terminal_id === "string" && !UUID_RE.test(payload.terminal_id)) {
        logger.warn(
          { id: row.id, terminal_id: payload.terminal_id },
          "outbox row carries a non-uuid terminal_id — koppel de tablet opnieuw",
        )
        payload.terminal_id = null
      }
      // Audit-regels dragen hun velden een niveau dieper, in de RPC-argumenten.
      const rpc = payload.rpc as Record<string, unknown> | undefined
      if (rpc) {
        for (const field of ["p_actor_terminal_id", "p_actor_user_id"]) {
          const v = rpc[field]
          if (typeof v === "string" && !UUID_RE.test(v)) {
            logger.warn({ id: row.id, field, value: v }, "audit row carries a non-uuid actor")
            rpc[field] = null
          }
        }
      }
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
      if (row.table_name === "pos_orders" && row.operation === "insert") {
        // Payload past niet 1-op-1 op de tabel (items[], totals{}) — de
        // ingest-RPC vertaalt en is idempotent op idempotency_key.
        const { error } = await supabaseAdmin.rpc("ingest_pos_order", { p: payload })
        if (error) throw error
      } else if (row.table_name === "pos_order_state_changes") {
        const { error } = await supabaseAdmin.rpc("ingest_pos_state_change", { p: payload })
        if (error) throw error
      } else if (row.table_name === "audit_event") {
        // Queued SBA audit event (Supabase was unreachable at write time):
        // replay via the same RPC so the advisory lock + hash trigger seal
        // the chain — never a direct table insert.
        const { error } = await supabaseAdmin.rpc(
          "write_audit_log",
          (payload as { rpc: Record<string, unknown> }).rpc,
        )
        if (error) throw error
      } else if (row.operation === "upsert") {
        // pos_menu_items has no idempotency_key column — its natural
        // conflict target is the row id (offline menu edits).
        const onConflict = row.table_name === "pos_menu_items" ? "id" : "idempotency_key"
        const { error } = await supabaseAdmin
          .from(row.table_name)
          .upsert(payload, { onConflict, ignoreDuplicates: false })
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
      const msg = describeError(err)
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

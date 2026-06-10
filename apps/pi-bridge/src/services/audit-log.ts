import { createClient } from "@supabase/supabase-js"
import { config } from "../config.js"
import { logger } from "../utils/logger.js"
import { enqueueOutbox } from "../db/outbox.js"
import { newId } from "../utils/ulid.js"

// SBA Fase 4 hash-chain writer. Pi calls the `write_audit_log` Postgres
// function with service-role; the function holds the per-org advisory
// lock and the `pos_audit_log_hash_before_insert` trigger seals the hash.
// Pi NEVER inserts into pos_audit_log directly — only via RPC so the lock
// + chain stay coherent across multiple writers. (On the shared BBQ DB the
// table is pos_audit_log to avoid colliding with BBQ's own audit_log.)

const supabaseAdmin = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

export type AuditEventType =
  | "order.placed"
  | "order.paid"
  | "order.voided"
  | "order.refunded"
  | "payment.captured"
  | "discount.applied"
  | "manager.override"
  | "tablet.paired"
  | "tablet.revoked"
  | "shift.opened"
  | "shift.closed"
  | "print.kitchen"
  | "print.customer"
  | "drawer.opened"

// Pinned canonical_json algorithm version. Bump in lockstep with
// apps/web/lib/audit/canonical-json.ts CANONICAL_JSON_VERSION and the
// SQL public.current_canonical_json_version().
const CANONICAL_JSON_VERSION = "2026-05-18-a"

export async function writeAuditEvent(args: {
  event_type: AuditEventType
  payload: Record<string, unknown>
  actor_user_id?: string | null
  actor_terminal_id?: string | null
  venue_id?: string | null
}): Promise<void> {
  // Round 2 P0-3: pin the canonical_json version on every payload so
  // future migrations can branch on it, AND every audit row carries
  // a traceable algorithm-id.
  const payloadWithVersion = {
    ...args.payload,
    canonical_json_version: CANONICAL_JSON_VERSION,
  }
  const rpcArgs = {
    p_org_id: config.ORG_ID,
    p_venue_id: args.venue_id ?? config.VENUE_ID,
    p_actor_user_id: args.actor_user_id ?? null,
    p_actor_terminal_id: args.actor_terminal_id ?? null,
    p_event_type: args.event_type,
    p_payload: payloadWithVersion,
  }
  const { error } = await supabaseAdmin.rpc("write_audit_log", rpcArgs)
  if (error) {
    // Truck without internet: an audit event must NEVER fail the order or
    // the print. Queue it locally; the outbox-flush worker replays it via
    // the same RPC ('audit_event' is the worker's RPC branch — it never
    // hits a PostgREST table insert). The hash chain is sealed at insert
    // time upstream, so flush order is what the chain records.
    const queued = enqueueOutbox({
      idempotency_key: newId(),
      operation: "insert",
      table_name: "audit_event",
      payload: { org_id: config.ORG_ID, rpc: rpcArgs },
      venue_id: rpcArgs.p_venue_id as string,
    })
    if (!queued.enqueued) {
      logger.error({ error, event_type: args.event_type }, "audit write failed AND queue refused")
      throw error
    }
    logger.warn({ event_type: args.event_type }, "audit event queued for replay (Supabase unreachable)")
  }
}

export { supabaseAdmin }

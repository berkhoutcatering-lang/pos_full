import { jwtVerify, decodeJwt } from "jose"
import { piDb } from "../db/outbox.js"
import { config } from "../config.js"
import { logger } from "../utils/logger.js"
import { writeAuditEvent } from "../services/audit-log.js"

// Round 3 P1-4 — flag tablet JWTs that expire within 5 days. The admin
// /admin/devices page surfaces these so a manager can pre-emptively
// re-pair before a busy shift. The watcher writes a `tablet.expiring`
// audit event the first time each terminal crosses the threshold; the
// next-step UI consumes that event.
//
// Pillar #1 Pi-Edge + Pillar #4 Foodtruck-First (no surprise lockouts).

const CHECK_INTERVAL_MS = 60 * 60_000 // hourly
const WARN_WINDOW_MS = 5 * 24 * 60 * 60 * 1000 // 5 days

const reminded = new Set<string>()

async function tickOnce() {
  const rows = piDb
    .prepare(
      `SELECT terminal_id, jti FROM paired_tablets WHERE last_seen_at > ?`,
    )
    .all(Date.now() - 30 * 24 * 60 * 60_000) as Array<{
    terminal_id: string
    jti: string
  }>

  for (const row of rows) {
    if (reminded.has(row.jti)) continue
    // The JWT itself isn't stored on the Pi; we use the issued_at from
    // the row + the JWT EXP rule. paired_tablets has paired_at; the JWT
    // exp is paired_at + 30d.
    const pairedAt = piDb
      .prepare("SELECT paired_at FROM paired_tablets WHERE jti = ?")
      .get(row.jti) as { paired_at: number } | undefined
    if (!pairedAt) continue
    const expiresAtMs = pairedAt.paired_at + 30 * 24 * 60 * 60_000
    const remainingMs = expiresAtMs - Date.now()
    if (remainingMs > WARN_WINDOW_MS) continue

    reminded.add(row.jti)
    try {
      await writeAuditEvent({
        event_type: "tablet.revoked", // re-use enum; payload distinguishes
        payload: {
          subtype: "expiring_soon",
          terminal_id: row.terminal_id,
          jti: row.jti,
          expires_at_ms: expiresAtMs,
          remaining_days: Math.floor(remainingMs / (24 * 60 * 60_000)),
        },
        actor_terminal_id: row.terminal_id,
      })
      logger.warn(
        { terminal_id: row.terminal_id, remaining_days: Math.floor(remainingMs / (24 * 60 * 60_000)) },
        "tablet JWT expiring within 5 days — re-pair reminder logged",
      )
    } catch (err) {
      logger.error({ err }, "jwt rotation watcher: audit write failed")
    }
  }
}

export function startJwtRotationWatcher() {
  void tickOnce()
  setInterval(() => {
    void tickOnce()
  }, CHECK_INTERVAL_MS)
  logger.info("jwt rotation watcher started (5-day expiry warning)")
}

// Silence unused-import warning for jose decoders left for future
// inline-JWT verification when we move pairings into Supabase.
void jwtVerify
void decodeJwt

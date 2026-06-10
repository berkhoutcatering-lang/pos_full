import type { FastifyInstance } from "fastify"
import { adminOnly } from "../middleware/admin-only.js"
import { piDb } from "../db/outbox.js"

// Undelivered order mutations, for the web app that runs ON the Pi.
// When Supabase is unreachable (truck without internet) the KDS/CFD SSR
// falls back to its last-good snapshot and overlays these pending rows so
// orders placed offline still reach the kitchen screen — not only the
// kitchen printer. Admin-token only: this is a server-to-server surface
// (Next.js on localhost), never the tablets.

interface PendingRow {
  idempotency_key: string
  operation: string
  table_name: string
  payload_json: string
  venue_id: string
  created_at: number
}

export async function outboxPendingRoutes(app: FastifyInstance) {
  app.get(
    "/admin/outbox/pending",
    { preHandler: adminOnly },
    async (_req, reply) => {
      const rows = piDb
        .prepare(
          `SELECT idempotency_key, operation, table_name, payload_json, venue_id, created_at
           FROM outbox
           WHERE delivered_at IS NULL
             AND table_name IN ('pos_orders', 'pos_order_state_changes')
           ORDER BY created_at ASC
           LIMIT 500`,
        )
        .all() as PendingRow[]

      return reply.send({
        rows: rows.map((r) => ({
          idempotency_key: r.idempotency_key,
          operation: r.operation,
          table_name: r.table_name,
          payload: JSON.parse(r.payload_json) as unknown,
          venue_id: r.venue_id,
          created_at: r.created_at,
        })),
      })
    },
  )
}

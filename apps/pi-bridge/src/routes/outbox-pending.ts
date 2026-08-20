import type { FastifyInstance } from "fastify"
import { adminOnly } from "../middleware/admin-only.js"
import { listFailedOutbox, piDb, requeueFailed } from "../db/outbox.js"

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

  // Wat er is blijven liggen nadat de aflevering bleef mislukken. Dit zijn
  // bestellingen die niet in de boekhouding staan, dus ze horen zichtbaar te
  // zijn in plaats van stilletjes in een tabel te verdwijnen.
  app.get(
    "/admin/outbox/failed",
    { preHandler: adminOnly },
    async (_req, reply) => {
      const rows = listFailedOutbox(100)
      return reply.send({ failed: rows, count: rows.length })
    },
  )

  // Terugzetten in de wachtrij, nadat de oorzaak is weggenomen. Veilig te
  // herhalen: de idempotency-key gaat mee en de ingest aan de Supabase-kant is
  // daarop idempotent.
  app.post(
    "/admin/outbox/requeue",
    { preHandler: adminOnly },
    async (req, reply) => {
      const body = (req.body ?? {}) as { ids?: number[] }
      const count = requeueFailed(Array.isArray(body.ids) ? body.ids : undefined)
      return reply.send({ requeued: count })
    },
  )
}

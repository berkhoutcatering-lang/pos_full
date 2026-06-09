import type { FastifyInstance } from "fastify"
import { outboxCounts } from "../db/outbox.js"
import { config } from "../config.js"

// Public liveness for Docker HEALTHCHECK is just `{status:"ok"}`.
// Detailed health behind x-admin-token so attackers can't fingerprint the
// outbox depth / mypos status / pglite presence.
export async function healthRoute(app: FastifyInstance) {
  app.get("/_health", async (req, reply) => {
    const token = req.headers["x-admin-token"]
    if (typeof token === "string" && token === config.PI_BRIDGE_ADMIN_TOKEN) {
      const counts = outboxCounts()
      return reply.send({
        status: "ok",
        outbox_pending: counts.pending,
        outbox_failed: counts.failed,
        mypos_session_ok: !!config.MYPOS_SESSION_SECRET,
        pglite_ok: true,
        venue_id: config.VENUE_ID,
        uptime_s: Math.round(process.uptime()),
      })
    }
    return reply.send({ status: "ok" })
  })
}

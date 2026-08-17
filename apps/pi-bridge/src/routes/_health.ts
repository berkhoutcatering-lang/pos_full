import type { FastifyInstance } from "fastify"
import { outboxCounts } from "../db/outbox.js"
import { config } from "../config.js"
import { getUplinkStatus } from "../services/uplink.js"

// Public liveness for Docker HEALTHCHECK is just `{status:"ok"}`.
// Detailed health behind x-admin-token so attackers can't fingerprint the
// outbox depth / mypos status / pglite presence.
export async function healthRoute(app: FastifyInstance) {
  app.get("/_health", async (req, reply) => {
    const token = req.headers["x-admin-token"]
    if (typeof token === "string" && token === config.PI_BRIDGE_ADMIN_TOKEN) {
      const counts = outboxCounts()
      // Cached, so `watch curl …/_health` over SSH stays cheap while you plug
      // a phone in and watch it come up.
      const uplink = await getUplinkStatus()
      return reply.send({
        status: "ok",
        outbox_pending: counts.pending,
        outbox_failed: counts.failed,
        uplink_state: uplink.state,
        uplink_interface: uplink.interface,
        uplink_kind: uplink.kind,
        mypos_reachable: uplink.mypos_reachable,
        clock_synced: uplink.clock_synced,
        mypos_transport: config.MYPOS_TRANSPORT,
        mypos_terminal_id: config.MYPOS_TID ?? null,
        mypos_gateway:
          config.MYPOS_TRANSPORT === "cloud" ? config.MYPOS_GATEWAY_URL : null,
        pglite_ok: true,
        venue_id: config.VENUE_ID,
        uptime_s: Math.round(process.uptime()),
      })
    }
    return reply.send({ status: "ok" })
  })
}

import type { FastifyInstance } from "fastify"
import { authenticateTablet } from "../middleware/auth-tablet.js"
import { getUplinkStatus } from "../services/uplink.js"

export async function uplinkRoutes(app: FastifyInstance) {
  // Paired-device only, not manager-only: the kassa has just as much reason to
  // know the Pi is cut off as the admin screen does.
  app.get("/uplink", { preHandler: authenticateTablet }, async (req, reply) => {
    // `?force=1` skips the cache for the "opnieuw controleren" button — after
    // plugging a phone in you want an answer now, not in ten seconds.
    const force = (req.query as { force?: string })?.force === "1"
    return reply.send(await getUplinkStatus(force))
  })
}

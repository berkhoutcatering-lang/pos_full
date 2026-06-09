import type { FastifyRequest, FastifyReply } from "fastify"
import { config } from "../config.js"

// X-Admin-Token guard. Used for: /admin/issue-pair-code, /admin/revoke,
// detailed /_health output. The token is set in /etc/pi-bridge/env and
// passed by Vercel server-side code via service-to-service header.

export async function adminOnly(req: FastifyRequest, reply: FastifyReply) {
  const token = req.headers["x-admin-token"]
  if (typeof token !== "string" || token !== config.PI_BRIDGE_ADMIN_TOKEN) {
    return reply.code(401).send({ error: "unauthorized" })
  }
}

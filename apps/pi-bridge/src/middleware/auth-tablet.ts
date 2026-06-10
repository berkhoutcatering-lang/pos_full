import type { FastifyRequest, FastifyReply } from "fastify"
import { verifyPairJwt } from "../services/pairing.js"
import { config } from "../config.js"

declare module "fastify" {
  interface FastifyRequest {
    tabletClaims?: { venue_id: string; terminal_id: string; role: string; jti: string }
  }
}

// Vast nil-uuid voor server-to-server calls: audit actor_terminal_id is
// een uuid-kolom, dus geen vrije tekst hier.
const ADMIN_TERMINAL_ID = "00000000-0000-0000-0000-000000000000"

export async function authenticateTablet(req: FastifyRequest, reply: FastifyReply) {
  // De lokale web-app (zelfde Pi) authenticeert server-to-server met het
  // admin-token — o.a. de Z-bon-print vanuit de dagafsluiting. Zonder dit
  // pad 401'de elke server-side /print/* call stilletjes.
  const adminToken = req.headers["x-admin-token"]
  if (typeof adminToken === "string" && adminToken === config.PI_BRIDGE_ADMIN_TOKEN) {
    req.tabletClaims = {
      venue_id: config.VENUE_ID,
      terminal_id: ADMIN_TERMINAL_ID,
      role: "manager",
      jti: "admin-token",
    }
    return
  }

  const token = req.cookies["hb-pair"]
  if (!token) {
    return reply.code(401).send({ error: "no_token" })
  }
  const claims = await verifyPairJwt(token)
  if (!claims) {
    return reply.code(401).send({ error: "invalid_token" })
  }
  req.tabletClaims = claims
}

export function requireRole(min: "cashier" | "manager") {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.tabletClaims) return reply.code(401).send({ error: "no_claims" })
    const rank: Record<string, number> = { cashier: 1, manager: 2 }
    if ((rank[req.tabletClaims.role] ?? 0) < (rank[min] ?? Number.MAX_SAFE_INTEGER)) {
      return reply.code(403).send({ error: "role_required", required: min })
    }
  }
}

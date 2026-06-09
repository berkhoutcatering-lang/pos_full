import type { FastifyRequest, FastifyReply } from "fastify"
import { verifyPairJwt } from "../services/pairing.js"

declare module "fastify" {
  interface FastifyRequest {
    tabletClaims?: { venue_id: string; terminal_id: string; role: string; jti: string }
  }
}

export async function authenticateTablet(req: FastifyRequest, reply: FastifyReply) {
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

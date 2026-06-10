import type { FastifyInstance } from "fastify"
import { authenticateTablet } from "../middleware/auth-tablet.js"

// Kassa-klantdisplay relay (bv. het tweede scherm van een Sunmi T3): de
// kassa publiceert zijn actuele bon, het klantscherm leest hem. In-memory
// per venue — vluchtige weergavedata, geen persistentie nodig. Werkt
// volledig offline over het AP. Eén kassa per venue (foodtruck); bij
// meerdere kassa's wint de laatste publicatie.

interface DisplayEntry {
  state: unknown
  at: number
}

const TTL_MS = 30 * 60 * 1000
const store = new Map<string, DisplayEntry>()

export async function displayRoutes(app: FastifyInstance) {
  app.post(
    "/display/state",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const claims = req.tabletClaims!
      const body = req.body as { state?: unknown }
      if (body?.state === undefined) {
        return reply.code(400).send({ error: "state_missing" })
      }
      store.set(claims.venue_id, { state: body.state, at: Date.now() })
      return reply.send({ ok: true })
    },
  )

  app.get(
    "/display/state",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const claims = req.tabletClaims!
      const entry = store.get(claims.venue_id)
      reply.header("cache-control", "no-store")
      if (!entry || Date.now() - entry.at > TTL_MS) {
        return reply.send({ state: null, at: null })
      }
      return reply.send({ state: entry.state, at: entry.at })
    },
  )
}

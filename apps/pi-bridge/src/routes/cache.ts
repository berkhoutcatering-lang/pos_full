import type { FastifyInstance } from "fastify"
import { authenticateTablet } from "../middleware/auth-tablet.js"
import { pgCache } from "../db/pglite-cache.js"

// Read-cache endpoints. PWA Workbox uses NetworkFirst against these so
// the kassa keeps a fresh menu when Supabase is reachable and falls
// back to the Pi-local copy when it isn't.

export async function cacheRoutes(app: FastifyInstance) {
  app.get(
    "/cache/menu",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const claims = req.tabletClaims!
      const result = await pgCache.query<{ id: string; payload: unknown }>(
        `SELECT id, payload FROM menu_items WHERE venue_id = $1 AND is_active = true`,
        [claims.venue_id],
      )
      reply.header("cache-control", "public, max-age=10")
      return reply.send({ items: result.rows })
    },
  )

  app.get(
    "/cache/modifiers",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const claims = req.tabletClaims!
      const result = await pgCache.query<{ id: string; payload: unknown }>(
        `SELECT id, payload FROM modifier_groups WHERE venue_id = $1`,
        [claims.venue_id],
      )
      reply.header("cache-control", "public, max-age=10")
      return reply.send({ groups: result.rows })
    },
  )

  app.get(
    "/cache/combos",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const claims = req.tabletClaims!
      const result = await pgCache.query<{ id: string; payload: unknown }>(
        `SELECT id, payload FROM combos WHERE venue_id = $1`,
        [claims.venue_id],
      )
      reply.header("cache-control", "public, max-age=10")
      return reply.send({ combos: result.rows })
    },
  )
}

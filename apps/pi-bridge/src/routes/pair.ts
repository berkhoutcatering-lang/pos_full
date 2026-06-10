import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { issuePairCode, redeemPairCode, revokeJti } from "../services/pairing.js"
import { writeAuditEvent } from "../services/audit-log.js"
import { adminOnly } from "../middleware/admin-only.js"
import { piDb } from "../db/outbox.js"

const IssueSchema = z.object({ role: z.enum(["cashier", "manager"]) })
const RedeemSchema = z.object({ code: z.string().length(8) })
const RevokeSchema = z.object({ jti: z.string().min(20), reason: z.string().max(200) })

export async function pairRoutes(app: FastifyInstance) {
  // Admin issues a code (called from Vercel /admin via service auth).
  app.post(
    "/admin/issue-pair-code",
    {
      preHandler: adminOnly,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const parsed = IssueSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      const result = issuePairCode(parsed.data.role)
      return reply.send(result)
    },
  )

  // Tablet redeems — rate-limited hard: 3/min, ban after 10.
  app.post(
    "/pair",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 minute", ban: 10 } },
    },
    async (req, reply) => {
      const parsed = RedeemSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "bad_code" })

      const result = await redeemPairCode(parsed.data.code)
      if (!result) return reply.code(401).send({ error: "invalid_code" })

      await writeAuditEvent({
        event_type: "tablet.paired",
        payload: { jti: result.jti },
        actor_terminal_id: result.terminal_id,
      })

      return reply
        .setCookie("hb-pair", result.jwt, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 30 * 24 * 60 * 60,
        })
        .send({ ok: true, terminal_id: result.terminal_id })
    },
  )

  // Admin lists paired tablets (devices UI on the local web app).
  app.get(
    "/admin/tablets",
    { preHandler: adminOnly },
    async (_req, reply) => {
      const rows = piDb
        .prepare(
          `SELECT t.terminal_id, t.venue_id, t.role, t.paired_at, t.last_seen_at, t.jti,
                  CASE WHEN r.jti IS NULL THEN 0 ELSE 1 END AS revoked
           FROM paired_tablets t
           LEFT JOIN revoked_jti r ON r.jti = t.jti
           ORDER BY t.paired_at DESC`,
        )
        .all() as Array<{
        terminal_id: string
        venue_id: string
        role: string
        paired_at: number
        last_seen_at: number | null
        jti: string
        revoked: 0 | 1
      }>
      return reply.send({
        tablets: rows.map((r) => ({ ...r, revoked: r.revoked === 1 })),
      })
    },
  )

  // Admin revokes a JTI (e.g. lost tablet).
  app.post(
    "/admin/revoke",
    { preHandler: adminOnly },
    async (req, reply) => {
      const parsed = RevokeSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      revokeJti(parsed.data.jti, parsed.data.reason)
      await writeAuditEvent({
        event_type: "tablet.revoked",
        payload: { jti: parsed.data.jti, reason: parsed.data.reason },
      })
      return reply.send({ ok: true })
    },
  )
}

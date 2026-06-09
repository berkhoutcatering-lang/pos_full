import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { issuePairCode, redeemPairCode, revokeJti } from "../services/pairing.js"
import { writeAuditEvent } from "../services/audit-log.js"
import { adminOnly } from "../middleware/admin-only.js"

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

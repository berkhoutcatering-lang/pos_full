import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authenticateTablet } from "../middleware/auth-tablet.js"
import { requireRole } from "../middleware/auth-tablet.js"
import {
  startMyPosTransaction,
  pollMyPosStatus,
  refundMyPos,
} from "../services/mypos-proxy.js"
import { writeAuditEvent } from "../services/audit-log.js"
import { ULID_RE } from "../utils/ulid.js"

const StartSchema = z.object({
  idempotency_key: z.string().regex(ULID_RE),
  amount_cents: z.number().int().positive().max(1_000_000),
  order_id: z.string().uuid(),
})

const StatusSchema = z.object({
  transaction_id: z.string().min(1).max(128),
})

const RefundSchema = z.object({
  transaction_id: z.string().min(1).max(128),
  amount_cents: z.number().int().positive().max(1_000_000),
  idempotency_key: z.string().regex(ULID_RE),
})

export async function myposRoutes(app: FastifyInstance) {
  app.post(
    "/mypos/start",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = StartSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues })
      }
      const claims = req.tabletClaims!

      const result = await startMyPosTransaction({
        ...parsed.data,
        venue_id: claims.venue_id,
      })

      await writeAuditEvent({
        event_type: "payment.captured",
        payload: {
          order_id: parsed.data.order_id,
          amount_cents: parsed.data.amount_cents,
          method: "pin",
          mypos_transaction_id: result.transaction_id,
          reused: result.reused ?? false,
        },
        actor_terminal_id: claims.terminal_id,
        venue_id: claims.venue_id,
      })

      return reply.send(result)
    },
  )

  app.get(
    "/mypos/status/:transaction_id",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = StatusSchema.safeParse(req.params)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      const result = await pollMyPosStatus(parsed.data.transaction_id)
      return reply.send(result)
    },
  )

  app.post(
    "/mypos/refund",
    { preHandler: [authenticateTablet, requireRole("manager")] },
    async (req, reply) => {
      const parsed = RefundSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })

      const result = await refundMyPos(
        parsed.data.transaction_id,
        parsed.data.amount_cents,
        parsed.data.idempotency_key,
        req.tabletClaims!.venue_id,
      )

      await writeAuditEvent({
        event_type: "order.refunded",
        payload: {
          transaction_id: parsed.data.transaction_id,
          amount_cents: parsed.data.amount_cents,
          refund_id: result.refund_id,
        },
        actor_terminal_id: req.tabletClaims!.terminal_id,
        venue_id: req.tabletClaims!.venue_id,
      })

      return reply.send(result)
    },
  )
}

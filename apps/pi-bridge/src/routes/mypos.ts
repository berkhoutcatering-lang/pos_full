import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authenticateTablet } from "../middleware/auth-tablet.js"
import { requireRole } from "../middleware/auth-tablet.js"
import {
  startMyPosTransaction,
  pollMyPosStatus,
  cancelMyPosTransaction,
  refundMyPos,
} from "../services/mypos-proxy.js"
import { writeAuditEvent } from "../services/audit-log.js"
import { config } from "../config.js"
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
      // PIN stays off until credentials are configured. Say so plainly so the
      // kassa can show "contant only" instead of a generic failure.
      if (config.MYPOS_TRANSPORT === "off") {
        return reply.code(503).send({ error: "mypos_disabled" })
      }

      const parsed = StartSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues })
      }
      const claims = req.tabletClaims!

      // No audit event here on purpose: the customer has not paid yet. The
      // proxy writes payment.captured once the terminal actually approves.
      const result = await startMyPosTransaction({
        ...parsed.data,
        venue_id: claims.venue_id,
        actor_terminal_id: claims.terminal_id,
      })

      return reply.send(result)
    },
  )

  app.get(
    "/mypos/status/:transaction_id",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      if (config.MYPOS_TRANSPORT === "off") {
        return reply.code(503).send({ error: "mypos_disabled" })
      }
      const parsed = StatusSchema.safeParse(req.params)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      try {
        return reply.send(await pollMyPosStatus(parsed.data.transaction_id))
      } catch (err) {
        // The intent is gone (reconciled away, or never existed on this Pi).
        // A 404 tells the kassa to start over rather than to keep polling.
        if ((err as Error).message === "mypos_unknown_transaction") {
          return reply.code(404).send({ error: "mypos_unknown_transaction" })
        }
        throw err
      }
    },
  )

  // Give up on a PIN that is still on the terminal. Called when the operator
  // walks away from the payment screen, so the amount does not stay armed.
  app.post(
    "/mypos/cancel",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      if (config.MYPOS_TRANSPORT === "off") {
        return reply.code(503).send({ error: "mypos_disabled" })
      }
      const parsed = StatusSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })

      try {
        return reply.send(await cancelMyPosTransaction(parsed.data.transaction_id))
      } catch (err) {
        if ((err as Error).message === "mypos_unknown_transaction") {
          return reply.code(404).send({ error: "mypos_unknown_transaction" })
        }
        throw err
      }
    },
  )

  app.post(
    "/mypos/refund",
    { preHandler: [authenticateTablet, requireRole("manager")] },
    async (req, reply) => {
      // Only the cloud transport can refund; over ECR myPOS documents no refund
      // method, so staff move the money in the myPOS app itself.
      if (config.MYPOS_TRANSPORT !== "cloud") {
        return reply.code(503).send({ error: "mypos_refund_unsupported" })
      }

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

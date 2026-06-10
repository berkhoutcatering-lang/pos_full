import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authenticateTablet } from "../middleware/auth-tablet.js"
import { enqueueOutbox, getOutboxPayload, nextQueueNumber } from "../db/outbox.js"
import { writeAuditEvent } from "../services/audit-log.js"
import { ULID_RE } from "../utils/ulid.js"
import { config } from "../config.js"

// PWA writes orders here over LAN. Pi enqueues to outbox FIRST so the
// kassa stays usable through Supabase outages. The outbox-flush worker
// replays them upstream.

const OrderItemSchema = z.object({
  id: z.string(),
  menu_item_id: z.string().uuid(),
  qty: z.number().int().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  btw_class: z.enum(["food_9", "alcohol_21", "soda_21", "nonalc_beer_9", "deposit_0", "service_0"]),
  modifiers: z
    .array(z.object({ id: z.string(), name: z.string(), price_delta_cents: z.number().int() }))
    .default([]),
  note: z.string().max(200).nullable().optional(),
})

const PlaceOrderSchema = z.object({
  idempotency_key: z.string().regex(ULID_RE),
  order_id: z.string().uuid(),
  org_id: z.string().uuid(),
  venue_id: z.string().uuid(),
  customer_label: z.string().max(64).nullable().optional(),
  items: z.array(OrderItemSchema).min(1).max(50),
  totals: z.object({
    excl_cents: z.number().int().nonnegative(),
    btw_cents: z.number().int().nonnegative(),
    incl_cents: z.number().int().nonnegative(),
    subtotal_cents: z.number().int().nonnegative().optional(),
    discount_cents: z.number().int().nonnegative().optional(),
  }),
})

const UpdateStateSchema = z.object({
  idempotency_key: z.string().regex(ULID_RE),
  order_id: z.string().uuid(),
  // "placed" = terug-transitie (kaart teruggesleept op de KDS).
  state: z.enum(["placed", "preparing", "ready", "served", "voided"]),
})

export async function orderRoutes(app: FastifyInstance) {
  app.post(
    "/orders/create",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = PlaceOrderSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues })
      }
      const claims = req.tabletClaims!
      if (parsed.data.venue_id !== claims.venue_id) {
        return reply.code(403).send({ error: "venue_mismatch" })
      }
      // P0-1: org_id MUST match this Pi's configured org. A multi-tenant
      // compromised tablet otherwise relays via service-role bypass.
      if (parsed.data.org_id !== config.ORG_ID) {
        return reply.code(403).send({ error: "org_mismatch" })
      }

      // De Pi geeft het afroepnummer uit zodat het ook zonder internet
      // bestaat; de cloud-trigger respecteert een aangeleverde daily_seq.
      const daily_seq = nextQueueNumber(claims.venue_id)
      const ordered_label = `#${daily_seq}`
      const payload = {
        ...parsed.data,
        daily_seq,
        ordered_label,
        terminal_id: claims.terminal_id,
        placed_at: new Date().toISOString(),
      }

      const enqueued = enqueueOutbox({
        idempotency_key: parsed.data.idempotency_key,
        operation: "insert",
        table_name: "pos_orders",
        payload,
        venue_id: claims.venue_id,
      })

      if (!enqueued.enqueued) {
        return reply.code(503).send({ error: enqueued.reason ?? "outbox_unavailable" })
      }
      if (enqueued.reason === "duplicate") {
        // Retry van dezelfde order: geef het oorspronkelijke nummer terug
        // (de teller is helaas al opgehoogd — een gat in de reeks is ok).
        const existing = getOutboxPayload(parsed.data.idempotency_key)
        const label = (existing?.ordered_label as string | undefined) ?? ordered_label
        return reply.send({ ok: true, queued: true, dedup: true, queue_label: label })
      }

      await writeAuditEvent({
        event_type: "order.placed",
        payload: {
          order_id: parsed.data.order_id,
          ordered_label,
          total_incl_cents: parsed.data.totals.incl_cents,
          item_count: parsed.data.items.length,
        },
        actor_terminal_id: claims.terminal_id,
        venue_id: claims.venue_id,
      })

      return reply.send({ ok: true, queued: true, dedup: false, queue_label: ordered_label, daily_seq })
    },
  )

  app.post(
    "/orders/update-state",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = UpdateStateSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      const claims = req.tabletClaims!

      const enqueued = enqueueOutbox({
        idempotency_key: parsed.data.idempotency_key,
        operation: "upsert",
        table_name: "pos_order_state_changes",
        payload: { ...parsed.data, terminal_id: claims.terminal_id },
        venue_id: claims.venue_id,
      })

      if (!enqueued.enqueued) {
        return reply.code(503).send({ error: enqueued.reason ?? "outbox_unavailable" })
      }

      if (parsed.data.state === "voided") {
        await writeAuditEvent({
          event_type: "order.voided",
          payload: { order_id: parsed.data.order_id },
          actor_terminal_id: claims.terminal_id,
          venue_id: claims.venue_id,
        })
      }

      return reply.send({ ok: true, queued: true })
    },
  )
}

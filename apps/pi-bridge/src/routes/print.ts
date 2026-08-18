import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authenticateTablet } from "../middleware/auth-tablet.js"
import { openCashDrawer, printKitchenBon, printCustomerBon } from "../services/printer.js"
import { writeAuditEvent } from "../services/audit-log.js"
import { checkAndMarkPrint } from "../db/outbox.js"
import { ULID_RE } from "../utils/ulid.js"

const KitchenSchema = z.object({
  idempotency_key: z.string().regex(ULID_RE),
  order_id: z.string().uuid(),
  order_label: z.string().max(64),
  items: z
    .array(
      z.object({
        name: z.string().max(80),
        qty: z.number().int().positive(),
        modifiers: z.array(z.string().max(80)).default([]),
        note: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
})

// De bedrijfsgegevens zaten hier vroeger in de body. Dat betekende dat elke
// caller ze moest weten, en in de praktijk stonden ze hardcoded met een
// verzonnen KvK-nummer. De Pi weet zelf bij welke zaak hij hoort; hij haalt ze
// uit pos_receipt_settings.
const CustomerSchema = z.object({
  idempotency_key: z.string().regex(ULID_RE),
  order_id: z.string().uuid(),
  order_label: z.string().max(64),
  items: z.array(
    z.object({
      name: z.string().max(80),
      qty: z.number().int().positive(),
      price_cents: z.number().int().nonnegative(),
      btw_rate: z.number().nonnegative().max(100),
      // Exacte splitsing uit de pricing-engine, zodat het BTW-blok op de bon
      // tot op de cent optelt naar het totaal. Optioneel: zonder deze velden
      // rekent de printer het zelf terug.
      line_excl_cents: z.number().int().nonnegative().optional(),
      line_btw_cents: z.number().int().nonnegative().optional(),
      line_incl_cents: z.number().int().nonnegative().optional(),
    }),
  ),
  total_excl_cents: z.number().int().nonnegative(),
  total_btw_cents: z.number().int().nonnegative(),
  total_incl_cents: z.number().int().nonnegative(),
  // Ontbreekt op een Z-rapport: dat is geen betaling.
  paid_method: z.enum(["cash", "pin", "ideal"]).optional(),
  title: z.string().max(64).optional(),
})

export async function printRoutes(app: FastifyInstance) {
  // Drawer-kick: geen idempotency nodig (een extra pulse is onschadelijk),
  // wel een audit-event — lade-opens zijn kas-relevant.
  app.post(
    "/print/drawer",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const claims = req.tabletClaims!
      try {
        await openCashDrawer()
      } catch (err) {
        return reply.send({ ok: false, soft_error: (err as Error).message })
      }
      await writeAuditEvent({
        event_type: "drawer.opened",
        payload: {},
        actor_terminal_id: claims.terminal_id,
        venue_id: claims.venue_id,
      })
      return reply.send({ ok: true })
    },
  )

  app.post(
    "/print/kitchen",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = KitchenSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      const claims = req.tabletClaims!

      const dedup = checkAndMarkPrint({
        idempotency_key: parsed.data.idempotency_key,
        kind: "kitchen",
        order_id: parsed.data.order_id,
      })
      if (dedup.already_printed) {
        return reply.send({ ok: true, dedup: true })
      }

      try {
        await printKitchenBon(parsed.data)
        await writeAuditEvent({
          event_type: "print.kitchen",
          payload: { order_id: parsed.data.order_id },
          actor_terminal_id: claims.terminal_id,
          venue_id: claims.venue_id,
        })
        return reply.send({ ok: true })
      } catch (err) {
        // Printer failures must NOT block the order. Surface a soft error
        // so the kassa can move on; admin sees the failure in /admin/devices.
        return reply.code(202).send({ ok: false, soft_error: (err as Error).message })
      }
    },
  )

  app.post(
    "/print/receipt",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = CustomerSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      const claims = req.tabletClaims!

      const dedup = checkAndMarkPrint({
        idempotency_key: parsed.data.idempotency_key,
        kind: "customer",
        order_id: parsed.data.order_id,
      })
      if (dedup.already_printed) {
        return reply.send({ ok: true, dedup: true })
      }

      try {
        await printCustomerBon(parsed.data)
        await writeAuditEvent({
          event_type: "print.customer",
          payload: { order_id: parsed.data.order_id, total: parsed.data.total_incl_cents },
          actor_terminal_id: claims.terminal_id,
          venue_id: claims.venue_id,
        })
        return reply.send({ ok: true })
      } catch (err) {
        return reply.code(202).send({ ok: false, soft_error: (err as Error).message })
      }
    },
  )
}

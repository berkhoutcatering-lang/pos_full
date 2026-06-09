import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authenticateTablet, requireRole } from "../middleware/auth-tablet.js"
import { enqueueOutbox } from "../db/outbox.js"
import { pgCache } from "../db/pglite-cache.js"
import { writeAuditEvent } from "../services/audit-log.js"
import { ULID_RE } from "../utils/ulid.js"
import { config } from "../config.js"
import { logger } from "../utils/logger.js"

// Pi-bridge first operational admin endpoints. Manager rolt op /admin/
// operational/* via paired-JWT; alle drie write naar PGlite cache direct
// (zodat /pos op de tablet binnen <100ms updates ziet via /cache/menu)
// EN enqueueren naar Supabase outbox voor cloud-truth.
//
// Pillar #1 Pi-Edge Cloud-Truth + Pillar #4 Foodtruck-First.

const StockUpdateSchema = z.object({
  item_id: z.string().uuid(),
  // Either set absolute or apply delta — caller picks one.
  set_to: z.number().int().nonnegative().nullable().optional(),
  delta: z.number().int().optional(),
  idempotency_key: z.string().regex(ULID_RE),
})

const AvailabilityToggleSchema = z.object({
  item_id: z.string().uuid(),
  // null = revert to default (volg is_active). true/false = expliciete override.
  available: z.boolean().nullable(),
  idempotency_key: z.string().regex(ULID_RE),
})

const PriceOverrideSchema = z.object({
  item_id: z.string().uuid(),
  // null = clear override
  price_cents: z.number().int().nonnegative().nullable(),
  expires_at: z.string().datetime().nullable(),
  idempotency_key: z.string().regex(ULID_RE),
})

// ---- Local PGlite mutators ----

async function patchPGliteMenuItem(itemId: string, patch: Record<string, unknown>) {
  const fields = Object.keys(patch)
  if (fields.length === 0) return
  // PGlite doesn't support parameter binding via $1, $2 the same way for
  // arbitrary key updates; build a safe whitelisted setter.
  const allowed = new Set([
    "stock_qty",
    "is_available_override",
    "price_override_cents",
    "price_override_expires_at",
  ])
  for (const k of fields) {
    if (!allowed.has(k)) {
      throw new Error(`PGlite patch: field ${k} not whitelisted`)
    }
  }
  // Update the cached menu_items.payload jsonb so /cache/menu picks it up
  // on next read. We don't store individual columns in the cache; we
  // store the full payload jsonb as the source of truth.
  await pgCache.query(
    `UPDATE menu_items
       SET payload = payload || $1::jsonb,
           cached_at = now()
     WHERE id = $2`,
    [JSON.stringify(patch), itemId],
  )
}

// ---- Route handlers ----

export async function adminOperationalRoutes(app: FastifyInstance) {
  // POST /admin/stock/update
  app.post(
    "/admin/stock/update",
    { preHandler: [authenticateTablet, requireRole("manager")] },
    async (req, reply) => {
      const parsed = StockUpdateSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      const claims = req.tabletClaims!

      const isSet = parsed.data.set_to !== undefined && parsed.data.set_to !== null
      const isDelta = parsed.data.delta !== undefined
      if (!isSet && !isDelta) {
        return reply.code(400).send({ error: "either set_to or delta required" })
      }

      // Update PGlite cache first — kassa sees it within next /cache/menu poll.
      let newStock: number | null = null
      if (isSet) {
        newStock = parsed.data.set_to!
        await patchPGliteMenuItem(parsed.data.item_id, { stock_qty: newStock })
      } else {
        // Read current, apply delta, write back. Race-safe genoeg voor één Pi.
        const cur = await pgCache.query<{ payload: { stock_qty: number | null } }>(
          `SELECT payload FROM menu_items WHERE id = $1`,
          [parsed.data.item_id],
        )
        const curStock = cur.rows[0]?.payload?.stock_qty
        if (curStock === null || curStock === undefined) {
          // ongelimiteerd — delta op ongelimiteerd is no-op
          newStock = null
        } else {
          newStock = Math.max(0, curStock + parsed.data.delta!)
          await patchPGliteMenuItem(parsed.data.item_id, { stock_qty: newStock })
        }
      }

      // Enqueue to Supabase outbox (cloud-truth).
      enqueueOutbox({
        idempotency_key: parsed.data.idempotency_key,
        operation: "upsert",
        table_name: "pos_menu_items",
        payload: {
          id: parsed.data.item_id,
          stock_qty: newStock,
        },
        venue_id: claims.venue_id,
      })

      // Audit event.
      await writeAuditEvent({
        event_type: "manager.override",
        payload: {
          action: "stock_update",
          item_id: parsed.data.item_id,
          set_to: parsed.data.set_to ?? null,
          delta: parsed.data.delta ?? null,
          new_stock_qty: newStock,
        },
        actor_terminal_id: claims.terminal_id,
        venue_id: claims.venue_id,
      })

      return reply.send({ ok: true, item_id: parsed.data.item_id, stock_qty: newStock })
    },
  )

  // POST /admin/availability/toggle
  app.post(
    "/admin/availability/toggle",
    { preHandler: [authenticateTablet, requireRole("manager")] },
    async (req, reply) => {
      const parsed = AvailabilityToggleSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      const claims = req.tabletClaims!

      await patchPGliteMenuItem(parsed.data.item_id, {
        is_available_override: parsed.data.available,
      })

      enqueueOutbox({
        idempotency_key: parsed.data.idempotency_key,
        operation: "upsert",
        table_name: "pos_menu_items",
        payload: {
          id: parsed.data.item_id,
          is_available_override: parsed.data.available,
        },
        venue_id: claims.venue_id,
      })

      await writeAuditEvent({
        event_type: "manager.override",
        payload: {
          action: "availability_toggle",
          item_id: parsed.data.item_id,
          available: parsed.data.available,
        },
        actor_terminal_id: claims.terminal_id,
        venue_id: claims.venue_id,
      })

      return reply.send({
        ok: true,
        item_id: parsed.data.item_id,
        is_available_override: parsed.data.available,
      })
    },
  )

  // POST /admin/price/override
  app.post(
    "/admin/price/override",
    { preHandler: [authenticateTablet, requireRole("manager")] },
    async (req, reply) => {
      const parsed = PriceOverrideSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      const claims = req.tabletClaims!

      await patchPGliteMenuItem(parsed.data.item_id, {
        price_override_cents: parsed.data.price_cents,
        price_override_expires_at: parsed.data.expires_at,
      })

      enqueueOutbox({
        idempotency_key: parsed.data.idempotency_key,
        operation: "upsert",
        table_name: "pos_menu_items",
        payload: {
          id: parsed.data.item_id,
          price_override_cents: parsed.data.price_cents,
          price_override_expires_at: parsed.data.expires_at,
        },
        venue_id: claims.venue_id,
      })

      await writeAuditEvent({
        event_type: "manager.override",
        payload: {
          action: "price_override",
          item_id: parsed.data.item_id,
          price_cents: parsed.data.price_cents,
          expires_at: parsed.data.expires_at,
        },
        actor_terminal_id: claims.terminal_id,
        venue_id: claims.venue_id,
      })

      return reply.send({
        ok: true,
        item_id: parsed.data.item_id,
        price_override_cents: parsed.data.price_cents,
        price_override_expires_at: parsed.data.expires_at,
      })
    },
  )
}

// Silence unused-import lint warnings on config/logger when used elsewhere.
void config
void logger

import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { adminOnly } from "../middleware/admin-only.js"
import { enqueueOutbox } from "../db/outbox.js"
import { pgCache } from "../db/pglite-cache.js"
import { writeAuditEvent } from "../services/audit-log.js"
import { ULID_RE } from "../utils/ulid.js"
import { config } from "../config.js"

// Offline menu writes. The web app (same box) calls this when Supabase is
// unreachable: the item lands DIRECT in the PGlite read-cache (kassa ziet
// hem meteen via /cache/menu) en in de outbox (synct naar pos_menu_items
// zodra er weer internet is — upsert op id, dus ook edits). Admin-token
// only: server-to-server, nooit de tablets.

const MenuUpsertSchema = z.object({
  idempotency_key: z.string().regex(ULID_RE),
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  venue_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  base_price_cents: z.number().int().min(0).max(100_000),
  btw_class: z.enum(["food_9", "alcohol_21", "soda_21", "nonalc_beer_9", "deposit_0", "service_0"]),
  station: z.string().min(1).max(20).default("grill"),
  is_discountable: z.boolean().default(true),
  available_modifier_group_ids: z.array(z.string().uuid()).max(10).default([]),
  is_active: z.boolean().default(true),
})

export async function menuAdminRoutes(app: FastifyInstance) {
  app.post(
    "/admin/menu/upsert",
    { preHandler: adminOnly },
    async (req, reply) => {
      const parsed = MenuUpsertSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues })
      }
      const item = parsed.data
      if (item.org_id !== config.ORG_ID) {
        return reply.code(403).send({ error: "org_mismatch" })
      }
      if (item.venue_id !== config.VENUE_ID) {
        return reply.code(403).send({ error: "venue_mismatch" })
      }

      // Queue for Supabase first — payload mirrors the pos_menu_items
      // columns exactly (the flush worker upserts on id).
      const { idempotency_key, ...columns } = item
      const enqueued = enqueueOutbox({
        idempotency_key,
        operation: "upsert",
        table_name: "pos_menu_items",
        payload: columns,
        venue_id: item.venue_id,
      })
      if (!enqueued.enqueued) {
        return reply.code(503).send({ error: enqueued.reason ?? "outbox_unavailable" })
      }

      // Then the local read-cache, in the same shape the pglite-warmer
      // writes (effective view row), so /cache/menu consumers see the item
      // without waiting for a warm cycle. Deactivated items leave the cache.
      if (item.is_active) {
        await pgCache.query(
          `INSERT INTO menu_items (id, venue_id, name, price_cents, btw_class, category, is_active, payload, cached_at)
           VALUES ($1, $2, $3, $4, $5, $6, true, $7, now())
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             price_cents = EXCLUDED.price_cents,
             btw_class = EXCLUDED.btw_class,
             category = EXCLUDED.category,
             is_active = EXCLUDED.is_active,
             payload = EXCLUDED.payload,
             cached_at = now()`,
          [
            item.id,
            item.venue_id,
            item.name,
            item.base_price_cents,
            item.btw_class,
            item.category,
            {
              id: item.id,
              venue_id: item.venue_id,
              name: item.name,
              effective_price_cents: item.base_price_cents,
              btw_class: item.btw_class,
              category: item.category,
              available_modifier_group_ids: item.available_modifier_group_ids,
              is_available: true,
            },
          ],
        )
      } else {
        await pgCache.query(`DELETE FROM menu_items WHERE id = $1 AND venue_id = $2`, [
          item.id,
          item.venue_id,
        ])
      }

      await writeAuditEvent({
        event_type: "manager.override",
        payload: {
          action: item.is_active ? "menu_item_upserted_offline" : "menu_item_deactivated_offline",
          item_id: item.id,
          name: item.name,
          price_cents: item.base_price_cents,
          btw_class: item.btw_class,
        },
        venue_id: item.venue_id,
      })

      return reply.send({ ok: true, queued: true, dedup: enqueued.reason === "duplicate" })
    },
  )
}

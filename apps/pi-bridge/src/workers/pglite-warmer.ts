import { supabaseAdmin } from "../services/audit-log.js"
import { config } from "../config.js"
import { pgCache } from "../db/pglite-cache.js"
import { logger } from "../utils/logger.js"

// Refreshes the Pi-local menu cache from Supabase. Phase 3 wires up the
// real pos_menu_items / pos_modifier_groups / pos_combos tables; this
// worker tolerates their absence so Phase 2 boots clean.

const REFRESH_MS = 60_000

async function refreshOnce() {
  try {
    const { data: items, error } = await supabaseAdmin
      .from("pos_menu_items")
      .select("id, venue_id, name, price_cents, btw_class, category, is_active, payload:row_to_json")
      .eq("venue_id", config.VENUE_ID)
      .eq("is_active", true)
    if (error) {
      // Phase 3 hasn't created the table yet — soft skip.
      if (error.code === "42P01") return
      throw error
    }
    if (!items) return

    await pgCache.transaction(async (tx) => {
      await tx.exec(`DELETE FROM menu_items WHERE venue_id = '${config.VENUE_ID}'`)
      for (const it of items as Array<Record<string, unknown>>) {
        await tx.query(
          `INSERT INTO menu_items (id, venue_id, name, price_cents, btw_class, category, is_active, payload, cached_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
          [
            it.id,
            it.venue_id,
            it.name,
            it.price_cents,
            it.btw_class,
            it.category ?? null,
            it.is_active,
            it.payload ?? it,
          ],
        )
      }
    })
    logger.info({ count: items.length }, "menu cache refreshed")
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "pglite warm failed; will retry")
  }
}

export function startPgliteWarmer() {
  refreshOnce().catch(() => {})
  setInterval(() => {
    refreshOnce().catch(() => {})
  }, REFRESH_MS)
  logger.info("pglite warmer started")
}

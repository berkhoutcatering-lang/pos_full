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
    // Read the effective view so the offline cache mirrors effective price +
    // availability (manager overrides, stock) and inherits name from the linked
    // gerecht. Maps to the local menu_items columns.
    const { data: items, error } = await supabaseAdmin
      .from("pos_menu_items_effective")
      .select("id, venue_id, name, effective_price_cents, btw_class, category, is_available")
      .eq("venue_id", config.VENUE_ID)
      .eq("is_available", true)
    if (error) {
      // View not present yet — soft skip.
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
            it.effective_price_cents,
            it.btw_class,
            it.category ?? null,
            it.is_available,
            it,
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

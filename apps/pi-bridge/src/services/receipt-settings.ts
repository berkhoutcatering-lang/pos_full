import { supabaseAdmin } from "./audit-log.js"
import { config } from "../config.js"
import { piDb } from "../db/outbox.js"
import { logger } from "../utils/logger.js"

// Wie staat er bovenaan de bon?
//
// Dit stond hardcoded in de kassa-code, met een verzonnen KvK- en BTW-nummer
// dat gewoon uit de printer rolde. Nu komt het uit Supabase, maar de bon moet
// ook printen als er geen internet is — dus houdt de Pi een kopie in SQLite en
// print hij daaruit.
//
// Elk veld mag leeg zijn, en leeg betekent "die regel niet printen". Een bon
// zonder KvK-nummer is beter dan een bon met een KvK-nummer dat niet bestaat.

export interface ReceiptSettings {
  legal_name: string | null
  kvk: string | null
  btw_id: string | null
  address_line: string | null
  postal_code: string | null
  city: string | null
  phone: string | null
  website: string | null
  footer_text: string | null
  print_logo: boolean
}

const EMPTY: ReceiptSettings = {
  legal_name: null,
  kvk: null,
  btw_id: null,
  address_line: null,
  postal_code: null,
  city: null,
  phone: null,
  website: null,
  footer_text: null,
  print_logo: true,
}

const REFRESH_MS = 5 * 60_000

function readCache(): ReceiptSettings | null {
  const row = piDb
    .prepare("SELECT payload_json FROM receipt_settings WHERE venue_id = ?")
    .get(config.VENUE_ID) as { payload_json: string } | undefined
  if (!row) return null
  try {
    return { ...EMPTY, ...(JSON.parse(row.payload_json) as Partial<ReceiptSettings>) }
  } catch {
    return null
  }
}

function writeCache(settings: ReceiptSettings) {
  piDb
    .prepare(
      `INSERT INTO receipt_settings (venue_id, payload_json, cached_at)
       VALUES (?, ?, ?)
       ON CONFLICT(venue_id) DO UPDATE SET payload_json = excluded.payload_json,
                                           cached_at = excluded.cached_at`,
    )
    .run(config.VENUE_ID, JSON.stringify(settings), Date.now())
}

/**
 * What to print with. Never throws and never blocks on the network: the
 * printer is on the critical path of handing someone their food.
 */
export function getReceiptSettings(): ReceiptSettings {
  return readCache() ?? EMPTY
}

async function refreshOnce() {
  try {
    const { data, error } = await supabaseAdmin
      .from("pos_receipt_settings")
      .select(
        "legal_name, kvk, btw_id, address_line, postal_code, city, phone, website, footer_text, print_logo",
      )
      .eq("venue_id", config.VENUE_ID)
      .maybeSingle()

    // Table not migrated yet — soft skip, same as the menu warmer does.
    if (error) {
      if (error.code === "42P01") return
      throw error
    }
    // No row yet: keep whatever we have rather than blanking a working bon.
    if (!data) return

    writeCache({ ...EMPTY, ...(data as Partial<ReceiptSettings>) })
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "receipt settings refresh failed; printing from cache",
    )
  }
}

export function startReceiptSettingsWarmer() {
  refreshOnce().catch(() => {})
  setInterval(() => {
    refreshOnce().catch(() => {})
  }, REFRESH_MS)
  logger.info("receipt settings warmer started")
}

/** Used by the admin route so a save shows up on the next bon, not in 5 minutes. */
export async function refreshReceiptSettingsNow() {
  await refreshOnce()
}

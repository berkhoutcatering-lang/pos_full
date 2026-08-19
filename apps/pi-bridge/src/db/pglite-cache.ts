import { rm, rename } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { logger } from "../utils/logger.js"

// Pi-local read-cache for menu / modifiers / combos. Keeps the kassa
// responsive when Supabase is unreachable. Written by the pglite-warmer
// worker; read by /cache/* routes.

const DATA_DIR = "/data/pglite-cache"
const QUARANTINE_DIR = `${DATA_DIR}.broken`

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS menu_items (
    id text primary key,
    venue_id text not null,
    name text not null,
    price_cents integer not null,
    btw_class text not null,
    category text,
    is_active boolean default true,
    payload jsonb not null,
    cached_at timestamptz not null default now()
  );
  CREATE INDEX IF NOT EXISTS menu_items_venue_active ON menu_items(venue_id, is_active);

  CREATE TABLE IF NOT EXISTS modifier_groups (
    id text primary key,
    venue_id text not null,
    payload jsonb not null,
    cached_at timestamptz not null default now()
  );

  CREATE TABLE IF NOT EXISTS combos (
    id text primary key,
    venue_id text not null,
    payload jsonb not null,
    cached_at timestamptz not null default now()
  );

  CREATE TABLE IF NOT EXISTS cache_meta (
    key text primary key,
    last_refreshed_at timestamptz not null,
    last_etag text
  );
`

async function open(dir: string | null): Promise<PGlite> {
  // PGlite's constructor starts the WASM boot lazily; a broken datadir only
  // surfaces on the first awaited call, so the exec below is the real probe.
  const db = dir ? new PGlite(`file://${dir}`) : new PGlite()
  await db.exec(SCHEMA)
  return db
}

// De cache is een cache: hij mag nooit de bridge meenemen. Een PGDATA die
// stukging bij stroomuitval, of die door een andere PGlite-versie is
// aangemaakt, laat de WASM-initdb crashen ("RuntimeError: unreachable").
// Toen dat op een top-level await stond, crashte het hele proces in een
// herstartlus en lagen PIN, bon en orders eruit vanwege het menu-cachetje.
async function init(): Promise<{ db: PGlite; durable: boolean }> {
  try {
    return { db: await open(DATA_DIR), durable: true }
  } catch (err) {
    logger.error({ err, dir: DATA_DIR }, "pglite cache unusable — quarantining datadir")
  }

  try {
    // Eén vaste quarantainenaam: bewijsmateriaal blijft bewaard zonder dat
    // een herstartlus de SD-kaart volschrijft.
    await rm(QUARANTINE_DIR, { recursive: true, force: true })
    await rename(DATA_DIR, QUARANTINE_DIR)
    const db = await open(DATA_DIR)
    logger.warn({ quarantine: QUARANTINE_DIR }, "pglite cache rebuilt from scratch")
    return { db, durable: true }
  } catch (err) {
    logger.error({ err }, "pglite cache rebuild failed — falling back to memory")
  }

  // Laatste redmiddel: in het geheugen. De warmer vult hem binnen een minuut
  // opnieuw vanuit Supabase; na een herstart is de cache leeg, maar de kassa
  // blijft draaien en dat is wat telt.
  const db = await open(null)
  return { db, durable: false }
}

const { db, durable } = await init()

export const pgCache = db
// False = de cache leeft alleen in RAM en overleeft geen herstart. /_health
// rapporteert dit zodat een stille degradatie zichtbaar blijft.
export const pgCacheDurable = durable

logger.info({ durable }, "pglite cache initialized")

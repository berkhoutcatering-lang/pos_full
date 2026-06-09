import { PGlite } from "@electric-sql/pglite"
import { logger } from "../utils/logger.js"

// Pi-local read-cache for menu / modifiers / combos. Keeps the kassa
// responsive when Supabase is unreachable. Written by the pglite-warmer
// worker; read by /cache/* routes.

export const pgCache = new PGlite("file:///data/pglite-cache")

await pgCache.exec(`
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
`)

logger.info("pglite cache initialized")

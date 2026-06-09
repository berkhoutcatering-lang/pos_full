-- Phase 1 Foundation — 0001 extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
-- ULIDs for idempotency keys live in app code (@hopbites/shared/ulid).
-- The pg "ulid" extension is optional and not used by RLS policies, so it's
-- omitted here to avoid coupling to a non-standard build.

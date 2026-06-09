-- Round 2 P0-3 — deterministic canonical_json across Postgres versions
-- and Node clients.
-- Pillar #2 BTW-Right Audit-Ready.
--
-- Problem (per Phase 5 audit): Postgres' `jsonb::text` for numerics
-- renders `1.0` differently from Node's `JSON.stringify(1)`. Two
-- semantically-equal payloads hash differently → chain verification
-- breaks across client/server boundaries.
--
-- Fix strategy:
-- 1. Reject jsonb payloads containing non-integer numerics at the
--    canonical layer. The application contract is cents-only — prices
--    in cents (int), totals in cents (int), rates as int (9/21/0).
-- 2. Pin a version field `canonical_json_version` on every event payload
--    so future migrations can track which algorithm produced the hash.
-- 3. Add a regression test in apps/web/tests/canonical-json.spec.ts that
--    feeds the SAME payloads to Postgres' canonical_json and a Node
--    re-implementation and asserts byte-for-byte equality.
--
-- This migration adds the validator + the version constant. The Node-side
-- mirror lives in apps/web/lib/audit/canonical-json.ts.

-- Reject any non-integer numerics anywhere in a payload. Recursive walk
-- via jsonb_path_exists tests every leaf. Returns true if the payload
-- is "safe" for canonical hashing.
create or replace function public.canonical_json_safe(input jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- jsonb_path_exists returns true if ANY leaf is a non-integer number.
  -- We invert: payload is safe iff no non-integer number is found.
  select not jsonb_path_exists(
    input,
    'strict $.** ? (@.type() == "number" && @ != @.floor())'
  )
$$;

-- Pin the canonical_json algorithm version. Bump this string whenever
-- the canonical_json function body changes, AND add a backward-compat
-- branch keyed off audit_log.payload->>'canonical_json_version'.
create or replace function public.current_canonical_json_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select '2026-05-18-a'::text
$$;

-- Add a CHECK on audit_log that every payload is safe + carries the
-- version pin.
alter table public.audit_log
  add constraint audit_log_payload_canonical_safe
  check (public.canonical_json_safe(payload));

alter table public.audit_log
  add constraint audit_log_payload_has_version
  check (payload ? 'canonical_json_version');

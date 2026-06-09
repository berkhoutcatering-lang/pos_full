-- Round 1 P0-4 — make audit_log.payload_canonical a generated column
-- Pillar #2 BTW-Right Audit-Ready.
--
-- The Phase 1 scaffold declared payload_canonical as a regular text column
-- and used the BEFORE INSERT trigger to populate it. That works at runtime
-- but is a spec/schema drift: external auditors reading the DDL see a
-- mutable column, not the immutable derived value the SBA Fase 4 chain
-- requires. Fix by making it a `generated always as ... stored` column
-- that Postgres itself recomputes on every insert/update and refuses to
-- accept explicit writes.
--
-- The trigger keeps its other duties (advisory lock + hash_curr + hash_prev)
-- but no longer writes payload_canonical itself.

-- 1) Drop the regular column. Existing rows are recomputed when re-added.
alter table public.audit_log
  drop column payload_canonical;

-- 2) Add it back as a stored generated column.
alter table public.audit_log
  add column payload_canonical text
  generated always as (public.canonical_json(payload)) stored;

-- 3) Replace the trigger body. STORED generated columns are computed
-- AFTER BEFORE triggers fire (Postgres docs), so the trigger MUST call
-- canonical_json(NEW.payload) itself to compute the hash. The generated
-- column then re-computes the same canonical value when Postgres
-- materializes the row — Postgres guarantees they match because
-- canonical_json is IMMUTABLE. The generated column's value is what
-- downstream readers (verifier, SAF-T export) see, and it's
-- untamperable because `generated always` rejects explicit writes.
create or replace function public.audit_log_hash_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev_hash text;
  canon text;
begin
  -- Compute canonical locally; matches what the generated column will
  -- store after this trigger returns.
  canon := public.canonical_json(NEW.payload);

  -- Serialize hash-chain inserts per org so concurrent writes don't race
  -- on the latest hash_prev. Re-entrant safe with the write_audit_log RPC
  -- (same key, same xact).
  perform pg_advisory_xact_lock(hashtext('audit_log:' || NEW.org_id::text));

  select hash_curr into prev_hash
  from public.audit_log
  where org_id = NEW.org_id
  order by seq_id desc
  limit 1;

  NEW.hash_prev := coalesce(prev_hash, '');
  NEW.hash_curr := encode(
    extensions.digest(
      NEW.seq_id::text || '|' || canon || '|' || coalesce(prev_hash, ''),
      'sha256'
    ),
    'hex'
  );
  return NEW;
end
$$;

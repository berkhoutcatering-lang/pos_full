-- Phase 1 Foundation — 0004 audit_log (SBA Fase 4 hash chain)
-- Append-only. Every business event is canonicalized + chained with sha256.
-- Insert is service-role only (Pi-bridge + API routes); authenticated reads only.

create table public.audit_log (
  seq_id bigserial primary key,
  org_id uuid not null references public.orgs(id) on delete restrict,
  venue_id uuid references public.venues(id) on delete set null,
  actor_user_id uuid,
  actor_terminal_id uuid,
  event_type text not null,
  payload jsonb not null,
  payload_canonical text,            -- set by trigger from canonical_json(payload)
  hash_prev text,
  hash_curr text not null default '',
  created_at timestamptz not null default now()
);

-- Hash chain trigger — runs BEFORE INSERT so hash_curr is durable.
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
  -- Canonicalize first (deterministic across versions — see canonical_json).
  canon := public.canonical_json(NEW.payload);
  NEW.payload_canonical := canon;

  -- Serialize hash-chain inserts per org (advisory lock survives MVCC snapshots
  -- that a plain SELECT ... FOR UPDATE would miss for concurrent inserts).
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

create trigger audit_log_hash_before_insert
  before insert on public.audit_log
  for each row
  execute function public.audit_log_hash_trigger();

-- Append-only enforcement
revoke update on public.audit_log from authenticated, anon;
revoke delete on public.audit_log from authenticated, anon;
revoke insert on public.audit_log from anon;
-- Authenticated cannot insert either; only service_role writes here.
revoke insert on public.audit_log from authenticated;

-- RLS
alter table public.audit_log enable row level security;

-- Audit payloads can contain PII (customer name, order detail). Gate reads to
-- manager+ minimum; cashiers don't need this surface.
create policy "audit_log_read_managers"
  on public.audit_log for select
  using (public.is_member_with_role(org_id, 'manager'));

-- Indexes for chain walks + venue-scoped views
create index audit_log_org_seq_idx on public.audit_log (org_id, seq_id);
create index audit_log_venue_time_idx on public.audit_log (venue_id, created_at desc);
create index audit_log_event_type_idx on public.audit_log (org_id, event_type, created_at desc);

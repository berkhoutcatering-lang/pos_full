-- Phase 6 Admin — 0019 dagafsluiting records
-- Records every Z-rapport that's been closed for a (venue, day). The hash
-- in audit_log is the legal anchor; this table is a fast-access cache for
-- the /admin/dagafsluiting UI so managers don't recompute on every visit.

create table public.dagafsluiting_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  business_date date not null,
  closed_at timestamptz not null default now(),
  closed_by_user_id uuid references auth.users(id) on delete set null,

  -- Snapshot of the computed report (totals + BTW + payment split).
  report_json jsonb not null,

  -- audit_log seq_id of the matching shift.closed event for cross-reference.
  audit_seq_id bigint,

  -- Idempotency: closing the same day twice returns the original row.
  idempotency_key text not null
    check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  unique (idempotency_key),
  unique (org_id, venue_id, business_date)
);

create index dagafsluiting_venue_date_idx
  on public.dagafsluiting_records (org_id, venue_id, business_date desc);

alter table public.dagafsluiting_records enable row level security;

create policy "dagafsluiting_read_managers"
  on public.dagafsluiting_records for select
  using (public.is_member_with_role(org_id, 'manager'));

create policy "dagafsluiting_write_managers"
  on public.dagafsluiting_records for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

-- Phase 3 Kassa — 0010 pos_idempotency
-- Server Action / Pi-bridge dedupe store. Every mutation client-generates a
-- ULID and Server Action checks here BEFORE doing work. TTL 7d via pg_cron
-- (configured in Phase 6 admin).

create table public.pos_idempotency (
  idempotency_key text primary key
    check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  org_id uuid not null references public.orgs(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  operation text not null check (operation in (
    'order.create', 'order.update', 'order.void',
    'payment.start', 'payment.capture', 'payment.refund',
    'print.kitchen', 'print.receipt'
  )),
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index pos_idempotency_org_venue_time_idx
  on public.pos_idempotency (org_id, venue_id, created_at desc);
create index pos_idempotency_ttl_idx on public.pos_idempotency (created_at);

alter table public.pos_idempotency enable row level security;

create policy "pos_idempotency_read_members" on public.pos_idempotency for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_idempotency.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_idempotency_write_cashiers" on public.pos_idempotency for insert
  with check (public.is_member_with_role(org_id, 'cashier'));

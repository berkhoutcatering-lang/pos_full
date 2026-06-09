-- Phase 1 Foundation — 0005 webhook_events
-- Idempotent inbox for Mollie / Moneybird / Resend webhooks. The (provider,
-- event_id) unique constraint is the dedupe key — handlers upsert and skip
-- when already processed. ULID idempotency keys live on the order/payment
-- tables themselves; this table dedupes by the upstream provider's id.

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mollie','moneybird','resend')),
  event_id text not null,                       -- provider's own id
  event_type text,
  org_id uuid references public.orgs(id) on delete set null,
  raw_body text check (raw_body is null or length(raw_body) < 1000000),  -- truncated after 90d unless tax-relevant
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

create index webhook_events_provider_time_idx on public.webhook_events (provider, received_at desc);
create index webhook_events_org_time_idx on public.webhook_events (org_id, received_at desc);
create index webhook_events_unprocessed_idx on public.webhook_events (provider, received_at) where processed_at is null;

alter table public.webhook_events enable row level security;

-- Raw webhook bodies may contain customer PII (e.g. Mollie iDEAL payer name +
-- email). Gate to manager+ minimum.
create policy "webhook_events_read_managers"
  on public.webhook_events for select
  using (
    org_id is not null
    and public.is_member_with_role(org_id, 'manager')
  );

-- Inserts via service-role only (webhook handlers run server-side).

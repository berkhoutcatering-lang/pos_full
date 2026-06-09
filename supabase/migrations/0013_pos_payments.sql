-- Phase 3 Kassa — 0013 pos_payments
-- Method-specific payment rows. One order can have multiple payments (split
-- cash + PIN, gift card + cash). idempotency_key dedup across retries.

create type public.pos_payment_method as enum (
  'cash', 'pin', 'ideal', 'gift_card', 'other'
);

create type public.pos_payment_status as enum (
  'pending', 'authorized', 'captured', 'failed', 'refunded', 'voided'
);

create table public.pos_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  org_id uuid not null,
  venue_id uuid not null,
  -- Composite FK enforces (org_id, venue_id) match the parent — same
  -- cross-tenant injection defence as pos_order_items.
  constraint pos_payments_parent_fk
    foreign key (order_id, org_id, venue_id)
    references public.pos_orders (id, org_id, venue_id)
    on delete cascade,
  idempotency_key text not null unique
    check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),

  method public.pos_payment_method not null,
  status public.pos_payment_status not null default 'pending',

  -- Positive for payment; negative for refund row.
  amount_cents int not null check (amount_cents <> 0),

  mypos_transaction_id text,
  mollie_payment_id text,
  cash_given_cents int check (cash_given_cents is null or cash_given_cents >= 0),
  cash_change_cents int check (cash_change_cents is null or cash_change_cents >= 0),

  authorized_at timestamptz,
  captured_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pos_payments_order_idx on public.pos_payments (order_id);
create index pos_payments_venue_time_idx
  on public.pos_payments (org_id, venue_id, created_at desc);
create index pos_payments_mollie_idx
  on public.pos_payments (mollie_payment_id) where mollie_payment_id is not null;
create index pos_payments_mypos_idx
  on public.pos_payments (mypos_transaction_id) where mypos_transaction_id is not null;

create trigger pos_payments_updated_at
  before update on public.pos_payments
  for each row execute function public.set_updated_at();

alter table public.pos_payments enable row level security;

create policy "pos_payments_read_members" on public.pos_payments for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_payments.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_payments_write_cashiers" on public.pos_payments for all
  using (public.is_member_with_role(org_id, 'cashier'))
  with check (public.is_member_with_role(org_id, 'cashier'));

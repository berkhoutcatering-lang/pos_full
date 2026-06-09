-- Phase 3 Kassa — 0011 pos_orders
-- Order header. State machine in `status`. Daily sequence + label set by trigger.

create type public.pos_order_status as enum (
  'draft', 'placed', 'preparing', 'ready', 'served', 'paid', 'voided', 'refunded'
);

create type public.pos_order_source as enum (
  'kassa', 'qr', 'phone'
);

create table public.pos_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  idempotency_key text not null unique
    check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),

  daily_seq int,
  ordered_label text,

  source public.pos_order_source not null,
  status public.pos_order_status not null default 'placed',

  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_terminal_id uuid,

  subtotal_cents int not null check (subtotal_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  total_excl_cents int not null check (total_excl_cents >= 0),
  total_btw_cents int not null check (total_btw_cents >= 0),
  total_incl_cents int not null check (total_incl_cents >= 0),

  customer_name text,
  customer_email text,
  customer_phone text,

  notes text,

  placed_at timestamptz not null default now(),
  prepared_at timestamptz,
  served_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  refunded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Composite unique on (id, org_id, venue_id) so child tables can enforce
-- via FK that their org_id/venue_id MATCHES the parent order's. Blocks the
-- "cashier in org B inserts line item under org A's order with org B's
-- org_id" injection.
alter table public.pos_orders
  add constraint pos_orders_id_org_venue_uniq unique (id, org_id, venue_id);

create index pos_orders_venue_time_idx
  on public.pos_orders (org_id, venue_id, placed_at desc);
create index pos_orders_active_kds_idx
  on public.pos_orders (org_id, venue_id, status)
  where status in ('placed', 'preparing', 'ready');
create index pos_orders_paid_idx
  on public.pos_orders (org_id, paid_at desc) where status = 'paid';

create or replace function public.set_updated_at()
returns trigger language plpgsql
security definer set search_path = '' as $$
begin NEW.updated_at = now(); return NEW; end
$$;

create trigger pos_orders_updated_at
  before update on public.pos_orders
  for each row execute function public.set_updated_at();

-- Daily sequence per (org, venue, day) — sets ordered_label '#42' if unset.
create or replace function public.set_pos_order_daily_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_seq int;
begin
  if NEW.daily_seq is null then
    perform pg_advisory_xact_lock(
      hashtext('pos_orders_seq:' || NEW.org_id::text || ':' || NEW.venue_id::text)
    );
    select coalesce(max(daily_seq), 0) into max_seq
    from public.pos_orders
    where org_id = NEW.org_id
      and venue_id = NEW.venue_id
      and date_trunc('day', placed_at) = date_trunc('day', NEW.placed_at);
    NEW.daily_seq := max_seq + 1;
  end if;
  if NEW.ordered_label is null then
    NEW.ordered_label := '#' || NEW.daily_seq::text;
  end if;
  return NEW;
end
$$;

create trigger pos_orders_daily_seq
  before insert on public.pos_orders
  for each row execute function public.set_pos_order_daily_seq();

-- RLS
alter table public.pos_orders enable row level security;

create policy "pos_orders_read_members" on public.pos_orders for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_orders.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_orders_write_cashiers" on public.pos_orders for all
  using (public.is_member_with_role(org_id, 'cashier'))
  with check (public.is_member_with_role(org_id, 'cashier'));

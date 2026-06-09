-- POS Phase B2: menu (linked to gerechten), orders, payments, idempotency,
-- state changes, KDS settings, dagafsluiting, CWV, realtime, pi_bridge role.
-- All FKs -> organizations/venues; RLS via organization_members + pos_role.

-- Enums (guarded for idempotency).
do $$ begin
  if not exists (select 1 from pg_type where typname='btw_class') then
    create type public.btw_class as enum ('food_9','nonalc_beer_9','alcohol_21','soda_21','deposit_0','service_0');
  end if;
  if not exists (select 1 from pg_type where typname='allergen') then
    create type public.allergen as enum ('gluten','crustacean','egg','fish','peanut','soy','milk','tree_nut','celery','mustard','sesame','sulfite','lupin','mollusc');
  end if;
  if not exists (select 1 from pg_type where typname='pos_order_status') then
    create type public.pos_order_status as enum ('draft','placed','preparing','ready','served','paid','voided','refunded');
  end if;
  if not exists (select 1 from pg_type where typname='pos_order_source') then
    create type public.pos_order_source as enum ('kassa','qr','phone');
  end if;
  if not exists (select 1 from pg_type where typname='pos_payment_method') then
    create type public.pos_payment_method as enum ('cash','pin','ideal','gift_card','other');
  end if;
  if not exists (select 1 from pg_type where typname='pos_payment_status') then
    create type public.pos_payment_status as enum ('pending','authorized','captured','failed','refunded','voided');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin NEW.updated_at = now(); return NEW; end $$;

-- pos_menu_items (links to shared gerechten via gerecht_id).
create table if not exists public.pos_menu_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  gerecht_id uuid references public.gerechten(id) on delete set null,
  name text not null,
  category text not null,
  base_price_cents int not null check (base_price_cents >= 0),
  btw_class public.btw_class not null,
  is_discountable boolean not null default true,
  available_modifier_group_ids uuid[] not null default '{}',
  image_url text,
  sort_order int not null default 100,
  station text not null default 'grill',
  allergens public.allergen[] not null default '{}',
  stock_qty int check (stock_qty is null or stock_qty >= 0),
  is_available_override boolean,
  price_override_cents int check (price_override_cents is null or price_override_cents >= 0),
  price_override_expires_at timestamptz,
  price_override_set_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pos_menu_items_venue_active_idx on public.pos_menu_items (org_id, venue_id, is_active, sort_order) where is_active;
create unique index if not exists pos_menu_items_venue_name_uniq on public.pos_menu_items (org_id, venue_id, name);
create index if not exists pos_menu_items_allergens_gin on public.pos_menu_items using gin (allergens);
create index if not exists pos_menu_items_available_idx on public.pos_menu_items (org_id, venue_id)
  where is_active and (is_available_override is not false) and (stock_qty is null or stock_qty > 0);
create index if not exists pos_menu_items_gerecht_idx on public.pos_menu_items (gerecht_id) where gerecht_id is not null;

create or replace function public.touch_pos_menu_items()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin NEW.updated_at := now(); return NEW; end $$;
drop trigger if exists pos_menu_items_touch on public.pos_menu_items;
create trigger pos_menu_items_touch before update on public.pos_menu_items
  for each row execute function public.touch_pos_menu_items();

create table if not exists public.pos_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= min_select),
  options jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists pos_modifier_groups_venue_idx on public.pos_modifier_groups (org_id, venue_id) where is_active;
create unique index if not exists pos_modifier_groups_venue_name_uniq on public.pos_modifier_groups (org_id, venue_id, name);

create table if not exists public.pos_combos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  trigger_item_ids uuid[] not null,
  trigger_min_qty jsonb not null default '{}'::jsonb,
  discount_cents int not null check (discount_cents > 0),
  active_from timestamptz, active_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists pos_combos_venue_active_idx on public.pos_combos (org_id, venue_id) where is_active;
create unique index if not exists pos_combos_venue_name_uniq on public.pos_combos (org_id, venue_id, name);

create table if not exists public.pos_staffels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  applies_to_item_ids text[] not null,
  qty_threshold int not null check (qty_threshold > 0),
  discount_per_extra_cents int not null check (discount_per_extra_cents > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists pos_staffels_venue_active_idx on public.pos_staffels (org_id, venue_id) where is_active;

alter table public.pos_menu_items enable row level security;
alter table public.pos_modifier_groups enable row level security;
alter table public.pos_combos enable row level security;
alter table public.pos_staffels enable row level security;
do $$
declare t text;
begin
  foreach t in array array['pos_menu_items','pos_modifier_groups','pos_combos','pos_staffels'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read_members', t);
    execute format('create policy %I on public.%I for select using (exists (select 1 from public.organization_members m where m.organization_id = %I.org_id and m.user_id = (select auth.uid()) and m.status = ''active''))', t||'_read_members', t, t);
    execute format('drop policy if exists %I on public.%I', t||'_write_managers', t);
    execute format('create policy %I on public.%I for all using (public.is_member_with_role(org_id, ''manager'')) with check (public.is_member_with_role(org_id, ''manager''))', t||'_write_managers', t);
  end loop;
end $$;

-- Effective menu view. gerecht-overerving (naam/foto/allergenen) wordt in een
-- latere migratie toegevoegd zodra de admin-koppeling live is.
create or replace view public.pos_menu_items_effective with (security_invoker = true) as
select i.id, i.org_id, i.venue_id, i.name, i.category, i.base_price_cents,
  case when i.price_override_cents is not null and (i.price_override_expires_at is null or i.price_override_expires_at > now())
    then i.price_override_cents else i.base_price_cents end as effective_price_cents,
  i.btw_class, i.is_discountable, i.available_modifier_group_ids, i.image_url, i.sort_order,
  i.stock_qty, i.is_available_override,
  case when not i.is_active then false when i.is_available_override is false then false
    when i.stock_qty is not null and i.stock_qty <= 0 then false else true end as is_available
from public.pos_menu_items i;

create or replace function public.decrement_stock(p_item_id uuid, p_qty int)
returns int language plpgsql security definer set search_path = ''
as $$
declare new_stock int;
begin
  perform pg_advisory_xact_lock(hashtext('stock:' || p_item_id::text));
  update public.pos_menu_items set stock_qty = greatest(stock_qty - p_qty, 0), updated_at = now()
    where id = p_item_id and stock_qty is not null returning stock_qty into new_stock;
  return coalesce(new_stock, -1);
end $$;
revoke execute on function public.decrement_stock(uuid, int) from public;
grant execute on function public.decrement_stock(uuid, int) to authenticated, service_role;

-- pos_orders.
create table if not exists public.pos_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  idempotency_key text not null unique check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  daily_seq int, ordered_label text,
  source public.pos_order_source not null,
  status public.pos_order_status not null default 'placed',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_terminal_id uuid,
  subtotal_cents int not null check (subtotal_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  total_excl_cents int not null check (total_excl_cents >= 0),
  total_btw_cents int not null check (total_btw_cents >= 0),
  total_incl_cents int not null check (total_incl_cents >= 0),
  customer_name text, customer_email text, customer_phone text, notes text,
  placed_at timestamptz not null default now(),
  prepared_at timestamptz, served_at timestamptz, paid_at timestamptz,
  voided_at timestamptz, refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='pos_orders_id_org_venue_uniq') then
    alter table public.pos_orders add constraint pos_orders_id_org_venue_uniq unique (id, org_id, venue_id);
  end if;
end $$;
create index if not exists pos_orders_venue_time_idx on public.pos_orders (org_id, venue_id, placed_at desc);
create index if not exists pos_orders_active_kds_idx on public.pos_orders (org_id, venue_id, status) where status in ('placed','preparing','ready');
create index if not exists pos_orders_paid_idx on public.pos_orders (org_id, paid_at desc) where status = 'paid';

drop trigger if exists pos_orders_updated_at on public.pos_orders;
create trigger pos_orders_updated_at before update on public.pos_orders for each row execute function public.set_updated_at();

create or replace function public.set_pos_order_daily_seq()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare max_seq int;
begin
  if NEW.daily_seq is null then
    perform pg_advisory_xact_lock(hashtext('pos_orders_seq:' || NEW.org_id::text || ':' || NEW.venue_id::text));
    select coalesce(max(daily_seq), 0) into max_seq from public.pos_orders
      where org_id = NEW.org_id and venue_id = NEW.venue_id
        and date_trunc('day', placed_at) = date_trunc('day', NEW.placed_at);
    NEW.daily_seq := max_seq + 1;
  end if;
  if NEW.ordered_label is null then NEW.ordered_label := '#' || NEW.daily_seq::text; end if;
  return NEW;
end $$;
drop trigger if exists pos_orders_daily_seq on public.pos_orders;
create trigger pos_orders_daily_seq before insert on public.pos_orders for each row execute function public.set_pos_order_daily_seq();

alter table public.pos_orders enable row level security;
drop policy if exists "pos_orders_read_members" on public.pos_orders;
create policy "pos_orders_read_members" on public.pos_orders for select
  using (exists (select 1 from public.organization_members m where m.organization_id = pos_orders.org_id and m.user_id = (select auth.uid()) and m.status='active'));
drop policy if exists "pos_orders_write_cashiers" on public.pos_orders;
create policy "pos_orders_write_cashiers" on public.pos_orders for all
  using (public.is_member_with_role(org_id, 'cashier')) with check (public.is_member_with_role(org_id, 'cashier'));

-- pos_order_items.
create table if not exists public.pos_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null, org_id uuid not null, venue_id uuid not null,
  constraint pos_order_items_parent_fk foreign key (order_id, org_id, venue_id)
    references public.pos_orders (id, org_id, venue_id) on delete cascade,
  position int not null check (position >= 0),
  menu_item_id uuid, name text not null, category text,
  qty int not null check (qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  modifier_total_cents int not null default 0 check (modifier_total_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),
  btw_class public.btw_class not null,
  btw_rate int not null check (btw_rate in (0, 9, 21)),
  line_excl_cents int not null check (line_excl_cents >= 0),
  line_btw_cents int not null check (line_btw_cents >= 0),
  line_incl_cents int not null check (line_incl_cents >= 0),
  modifiers_json jsonb not null default '[]'::jsonb, notes text,
  combo_id uuid, is_combo_anchor boolean not null default false,
  station text not null default 'grill',
  allergens_snapshot public.allergen[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists pos_order_items_order_pos_idx on public.pos_order_items (order_id, position);
create index if not exists pos_order_items_venue_time_idx on public.pos_order_items (org_id, venue_id, created_at desc);
create index if not exists pos_order_items_station_idx on public.pos_order_items (org_id, venue_id, station);
alter table public.pos_order_items enable row level security;
drop policy if exists "pos_order_items_read_members" on public.pos_order_items;
create policy "pos_order_items_read_members" on public.pos_order_items for select
  using (exists (select 1 from public.organization_members m where m.organization_id = pos_order_items.org_id and m.user_id = (select auth.uid()) and m.status='active'));
drop policy if exists "pos_order_items_write_cashiers" on public.pos_order_items;
create policy "pos_order_items_write_cashiers" on public.pos_order_items for all
  using (public.is_member_with_role(org_id, 'cashier')) with check (public.is_member_with_role(org_id, 'cashier'));

-- pos_payments.
create table if not exists public.pos_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null, org_id uuid not null, venue_id uuid not null,
  constraint pos_payments_parent_fk foreign key (order_id, org_id, venue_id)
    references public.pos_orders (id, org_id, venue_id) on delete cascade,
  idempotency_key text not null unique check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  method public.pos_payment_method not null,
  status public.pos_payment_status not null default 'pending',
  amount_cents int not null check (amount_cents <> 0),
  mypos_transaction_id text, mollie_payment_id text,
  cash_given_cents int check (cash_given_cents is null or cash_given_cents >= 0),
  cash_change_cents int check (cash_change_cents is null or cash_change_cents >= 0),
  authorized_at timestamptz, captured_at timestamptz, failed_at timestamptz, refunded_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pos_payments_order_idx on public.pos_payments (order_id);
create index if not exists pos_payments_venue_time_idx on public.pos_payments (org_id, venue_id, created_at desc);
create index if not exists pos_payments_mollie_idx on public.pos_payments (mollie_payment_id) where mollie_payment_id is not null;
create index if not exists pos_payments_mypos_idx on public.pos_payments (mypos_transaction_id) where mypos_transaction_id is not null;
drop trigger if exists pos_payments_updated_at on public.pos_payments;
create trigger pos_payments_updated_at before update on public.pos_payments for each row execute function public.set_updated_at();
alter table public.pos_payments enable row level security;
drop policy if exists "pos_payments_read_members" on public.pos_payments;
create policy "pos_payments_read_members" on public.pos_payments for select
  using (exists (select 1 from public.organization_members m where m.organization_id = pos_payments.org_id and m.user_id = (select auth.uid()) and m.status='active'));
drop policy if exists "pos_payments_write_cashiers" on public.pos_payments;
create policy "pos_payments_write_cashiers" on public.pos_payments for all
  using (public.is_member_with_role(org_id, 'cashier')) with check (public.is_member_with_role(org_id, 'cashier'));

-- pos_idempotency.
create table if not exists public.pos_idempotency (
  idempotency_key text primary key check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  operation text not null check (operation in ('order.create','order.update','order.void','payment.start','payment.capture','payment.refund','print.kitchen','print.receipt')),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists pos_idempotency_org_venue_time_idx on public.pos_idempotency (org_id, venue_id, created_at desc);
create index if not exists pos_idempotency_ttl_idx on public.pos_idempotency (created_at);
alter table public.pos_idempotency enable row level security;
drop policy if exists "pos_idempotency_read_members" on public.pos_idempotency;
create policy "pos_idempotency_read_members" on public.pos_idempotency for select
  using (exists (select 1 from public.organization_members m where m.organization_id = pos_idempotency.org_id and m.user_id = (select auth.uid()) and m.status='active'));
drop policy if exists "pos_idempotency_write_cashiers" on public.pos_idempotency;
create policy "pos_idempotency_write_cashiers" on public.pos_idempotency for insert
  with check (public.is_member_with_role(org_id, 'cashier'));

-- pos_order_state_changes.
create table if not exists public.pos_order_state_changes (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  order_id uuid not null, org_id uuid not null, venue_id uuid not null,
  constraint pos_order_state_changes_parent_fk foreign key (order_id, org_id, venue_id)
    references public.pos_orders (id, org_id, venue_id) on delete cascade,
  from_state public.pos_order_status, to_state public.pos_order_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_terminal_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists pos_order_state_changes_order_time_idx on public.pos_order_state_changes (order_id, created_at desc);
create index if not exists pos_order_state_changes_venue_time_idx on public.pos_order_state_changes (org_id, venue_id, created_at desc);
alter table public.pos_order_state_changes enable row level security;
drop policy if exists "pos_order_state_changes_read_members" on public.pos_order_state_changes;
create policy "pos_order_state_changes_read_members" on public.pos_order_state_changes for select
  using (exists (select 1 from public.organization_members m where m.organization_id = pos_order_state_changes.org_id and m.user_id = (select auth.uid()) and m.status='active'));
drop policy if exists "pos_order_state_changes_write_cashiers" on public.pos_order_state_changes;
create policy "pos_order_state_changes_write_cashiers" on public.pos_order_state_changes for all
  using (public.is_member_with_role(org_id, 'cashier')) with check (public.is_member_with_role(org_id, 'cashier'));

-- venue_kds_settings.
create table if not exists public.venue_kds_settings (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  stations text[] not null default array['grill'],
  default_station text not null default 'grill',
  auto_print_on_bump boolean not null default true,
  bell_on_ready boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists venue_kds_settings_org_idx on public.venue_kds_settings (org_id);
alter table public.venue_kds_settings enable row level security;
drop policy if exists "venue_kds_settings_read_members" on public.venue_kds_settings;
create policy "venue_kds_settings_read_members" on public.venue_kds_settings for select
  using (exists (select 1 from public.organization_members m where m.organization_id = venue_kds_settings.org_id and m.user_id = (select auth.uid()) and m.status='active'));
drop policy if exists "venue_kds_settings_write_managers" on public.venue_kds_settings;
create policy "venue_kds_settings_write_managers" on public.venue_kds_settings for all
  using (public.is_member_with_role(org_id, 'manager')) with check (public.is_member_with_role(org_id, 'manager'));
create or replace function public.touch_venue_kds_settings()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin NEW.updated_at := now(); return NEW; end $$;
drop trigger if exists venue_kds_settings_touch on public.venue_kds_settings;
create trigger venue_kds_settings_touch before update on public.venue_kds_settings for each row execute function public.touch_venue_kds_settings();

-- dagafsluiting_records.
create table if not exists public.dagafsluiting_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  business_date date not null,
  closed_at timestamptz not null default now(),
  closed_by_user_id uuid references auth.users(id) on delete set null,
  report_json jsonb not null,
  audit_seq_id bigint,
  idempotency_key text not null check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  unique (idempotency_key),
  unique (org_id, venue_id, business_date)
);
create index if not exists dagafsluiting_venue_date_idx on public.dagafsluiting_records (org_id, venue_id, business_date desc);
alter table public.dagafsluiting_records enable row level security;
drop policy if exists "dagafsluiting_read_managers" on public.dagafsluiting_records;
create policy "dagafsluiting_read_managers" on public.dagafsluiting_records for select
  using (public.is_member_with_role(org_id, 'manager'));
drop policy if exists "dagafsluiting_write_managers" on public.dagafsluiting_records;
create policy "dagafsluiting_write_managers" on public.dagafsluiting_records for all
  using (public.is_member_with_role(org_id, 'manager')) with check (public.is_member_with_role(org_id, 'manager'));

-- cwv_metrics.
create table if not exists public.cwv_metrics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in ('INP','LCP','CLS')),
  value_ms int not null,
  rating text check (rating in ('good','needs-improvement','poor')),
  path text, nav_type text,
  created_at timestamptz not null default now()
);
create index if not exists cwv_metrics_name_time_idx on public.cwv_metrics (name, created_at desc);
create index if not exists cwv_metrics_path_time_idx on public.cwv_metrics (path, created_at desc);
alter table public.cwv_metrics enable row level security;
drop policy if exists "cwv_metrics_read_authenticated" on public.cwv_metrics;
create policy "cwv_metrics_read_authenticated" on public.cwv_metrics for select using ((select auth.uid()) is not null);

-- Realtime publication, guarded.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pos_orders') then
    alter publication supabase_realtime add table public.pos_orders; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pos_order_items') then
    alter publication supabase_realtime add table public.pos_order_items; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pos_menu_items') then
    alter publication supabase_realtime add table public.pos_menu_items; end if;
end $$;

-- pi_bridge least-privilege role.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='pi_bridge') then create role pi_bridge nologin; end if;
end $$;
grant usage on schema public to pi_bridge;
grant execute on function public.write_audit_log(uuid, uuid, uuid, uuid, text, jsonb) to pi_bridge;
grant select on public.pos_menu_items, public.pos_modifier_groups, public.pos_combos, public.pos_staffels to pi_bridge;
grant select on public.org_theme_settings, public.venues, public.organizations to pi_bridge;
grant insert, update on public.pos_orders, public.pos_order_items, public.pos_payments to pi_bridge;

create or replace function public.pi_bridge_org_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select nullif(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'pi_org_id', ''), '')::uuid $$;

drop policy if exists "pos_orders_pi_bridge_write" on public.pos_orders;
create policy "pos_orders_pi_bridge_write" on public.pos_orders for all to pi_bridge
  using (org_id = public.pi_bridge_org_id()) with check (org_id = public.pi_bridge_org_id());
drop policy if exists "pos_order_items_pi_bridge_write" on public.pos_order_items;
create policy "pos_order_items_pi_bridge_write" on public.pos_order_items for all to pi_bridge
  using (org_id = public.pi_bridge_org_id()) with check (org_id = public.pi_bridge_org_id());
drop policy if exists "pos_payments_pi_bridge_write" on public.pos_payments;
create policy "pos_payments_pi_bridge_write" on public.pos_payments for all to pi_bridge
  using (org_id = public.pi_bridge_org_id()) with check (org_id = public.pi_bridge_org_id());
revoke all on public.organization_members, public.pos_audit_log from pi_bridge;

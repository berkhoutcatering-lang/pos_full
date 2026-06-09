-- Phase 3 Kassa — 0009 pos_menu_items + pos_modifier_groups + pos_combos + pos_staffels
-- Read-mostly catalog. Edited from /admin (Phase 6) and surfaced to /pos via
-- the Pi-bridge read-cache (PGlite). BTW class is set per item and IS NOT
-- inferred at runtime — the pricing engine reads BTW_RULES_2026.

create type public.btw_class as enum (
  'food_9',           -- BBQ-eten, broodjes, frisdrank-non-alc, ijs, frites — 9%
  'nonalc_beer_9',    -- Alcoholvrij bier <= 0.5% — 9%
  'alcohol_21',       -- Bier, wijn, cocktails, mixdrankjes — 21%
  'soda_21',          -- Energy drinks (Red Bull, Monster) — 21% sinds 2024
  'deposit_0',        -- Statiegeld — 0% (geen BTW)
  'service_0'         -- Fooi / optionele servicekosten — 0%
);

create table public.pos_menu_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  category text not null,
  base_price_cents int not null check (base_price_cents >= 0),
  btw_class public.btw_class not null,
  is_discountable boolean not null default true,
  available_modifier_group_ids uuid[] not null default '{}',
  image_url text,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pos_menu_items_venue_active_idx
  on public.pos_menu_items (org_id, venue_id, is_active, sort_order)
  where is_active;

-- Idempotent seed support
create unique index pos_menu_items_venue_name_uniq
  on public.pos_menu_items (org_id, venue_id, name);

create table public.pos_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= min_select),
  options jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index pos_modifier_groups_venue_idx
  on public.pos_modifier_groups (org_id, venue_id)
  where is_active;

create unique index pos_modifier_groups_venue_name_uniq
  on public.pos_modifier_groups (org_id, venue_id, name);

create table public.pos_combos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  trigger_item_ids uuid[] not null,
  trigger_min_qty jsonb not null default '{}'::jsonb,
  discount_cents int not null check (discount_cents > 0),
  active_from timestamptz,
  active_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index pos_combos_venue_active_idx
  on public.pos_combos (org_id, venue_id) where is_active;

create unique index pos_combos_venue_name_uniq
  on public.pos_combos (org_id, venue_id, name);

create table public.pos_staffels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  applies_to_item_ids text[] not null,    -- '*' or specific ids
  qty_threshold int not null check (qty_threshold > 0),
  discount_per_extra_cents int not null check (discount_per_extra_cents > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index pos_staffels_venue_active_idx
  on public.pos_staffels (org_id, venue_id) where is_active;

-- updated_at touch
create or replace function public.touch_pos_menu_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin NEW.updated_at := now(); return NEW; end
$$;

create trigger pos_menu_items_touch
  before update on public.pos_menu_items
  for each row execute function public.touch_pos_menu_items();

-- RLS
alter table public.pos_menu_items enable row level security;
alter table public.pos_modifier_groups enable row level security;
alter table public.pos_combos enable row level security;
alter table public.pos_staffels enable row level security;

create policy "pos_menu_items_read_members" on public.pos_menu_items for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_menu_items.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_menu_items_write_managers" on public.pos_menu_items for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

create policy "pos_modifier_groups_read_members" on public.pos_modifier_groups for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_modifier_groups.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_modifier_groups_write_managers" on public.pos_modifier_groups for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

create policy "pos_combos_read_members" on public.pos_combos for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_combos.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_combos_write_managers" on public.pos_combos for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

create policy "pos_staffels_read_members" on public.pos_staffels for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_staffels.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_staffels_write_managers" on public.pos_staffels for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

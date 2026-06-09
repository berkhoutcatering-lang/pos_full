-- Phase 1 Foundation — 0003 orgs, venues, memberships
-- Multi-tenant root. Every later table references org_id (+ venue_id where
-- applicable) and uses the helpers from 0002 in its RLS policies.

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kvk_number text,
  btw_number text,
  tier text not null default 'free' check (tier in ('free','pro','enterprise')),
  created_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  slug text not null,
  pi_bridge_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

create type public.role_enum as enum ('owner','manager','cashier','viewer');

create table public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  role public.role_enum not null,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- Indexes for RLS-policy columns (every policy filters on user_id + org_id).
create index memberships_user_idx on public.memberships (user_id);
create index memberships_org_idx on public.memberships (org_id);
create index venues_org_active_idx on public.venues (org_id) where active;

-- RLS
alter table public.orgs enable row level security;
alter table public.venues enable row level security;
alter table public.memberships enable row level security;

-- orgs — members read; owners update
create policy "orgs_read_members"
  on public.orgs for select
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = orgs.id
        and m.user_id = (select auth.uid())
    )
  );

create policy "orgs_update_owners"
  on public.orgs for update
  using (public.is_member_with_role(orgs.id, 'owner'))
  with check (public.is_member_with_role(orgs.id, 'owner'));

-- venues — members read active; managers write
create policy "venues_read_members"
  on public.venues for select
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = venues.org_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "venues_write_managers"
  on public.venues for all
  using (public.is_member_with_role(venues.org_id, 'manager'))
  with check (public.is_member_with_role(venues.org_id, 'manager'));

-- memberships — users see their own row; owners manage all rows in their org
create policy "memberships_read_self"
  on public.memberships for select
  using (user_id = (select auth.uid()));

create policy "memberships_read_owners"
  on public.memberships for select
  using (public.is_member_with_role(org_id, 'owner'));

create policy "memberships_write_owners"
  on public.memberships for all
  using (public.is_member_with_role(org_id, 'owner'))
  with check (public.is_member_with_role(org_id, 'owner'));

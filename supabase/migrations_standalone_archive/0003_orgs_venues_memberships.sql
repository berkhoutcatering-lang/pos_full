-- Phase 1 Foundation — 0003 venues + POS tenant extensions
--
-- SHARED-DB NOTE: the multi-tenant root (`organizations`, `organization_members`)
-- already exists in the BBQ Architect project and is shared via auth.users SSO.
-- This migration does NOT create those tables. Instead it:
--   1. Adds POS-only columns to the shared tenant tables (pos_role, pos_tier,
--      manager_pin_hash) — additive, never touching BBQ's own columns.
--   2. Creates `venues`, the POS-only second tenancy axis (foodtruck locations),
--      with org_id -> organizations(id).
-- Every later POS table references org_id (-> organizations) + venue_id and uses
-- the helpers from 0002 in its RLS policies.

-- 1a. POS membership role, kept separate from BBQ's free-text `role`.
alter table public.organization_members
  add column if not exists pos_role text
    check (pos_role is null or pos_role in ('owner','manager','cashier','viewer'));

-- 1b. POS billing tier (drives the Anthropic cost cap). BBQ uses `plan`/
-- `subscription_status`; pos_tier is POS-only so they never fight.
alter table public.organizations
  add column if not exists pos_tier text not null default 'free'
    check (pos_tier in ('free','pro','enterprise'));

-- 2. venues — POS-only foodtruck/location axis.
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  pi_bridge_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists venues_org_active_idx on public.venues (org_id) where active;

alter table public.venues enable row level security;

-- venues — members read active; managers write
drop policy if exists "venues_read_members" on public.venues;
create policy "venues_read_members"
  on public.venues for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = venues.org_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

drop policy if exists "venues_write_managers" on public.venues;
create policy "venues_write_managers"
  on public.venues for all
  using (public.is_member_with_role(venues.org_id, 'manager'))
  with check (public.is_member_with_role(venues.org_id, 'manager'));

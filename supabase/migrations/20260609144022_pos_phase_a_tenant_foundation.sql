-- POS Phase A: tenant foundation (ADDITIVE on BBQ Architect shared DB).
-- Does NOT touch current_org_id() or any existing BBQ object except additive
-- ADD COLUMN IF NOT EXISTS on organization_members / organizations.

-- 1. POS-only columns on the shared tenant tables.
alter table public.organization_members
  add column if not exists pos_role text
    check (pos_role is null or pos_role in ('owner','manager','cashier','viewer'));
alter table public.organization_members
  add column if not exists manager_pin_hash text
    check (manager_pin_hash is null or manager_pin_hash like '$argon2id$%');
alter table public.organizations
  add column if not exists pos_tier text not null default 'free'
    check (pos_tier in ('free','pro','enterprise'));

-- 2. RLS helpers (new names; current_org_id() left untouched).
create or replace function public.current_venue_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select nullif(current_setting('request.venue_id', true), '')::uuid $$;

create or replace function public.current_role_in_org()
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v_role text;
begin
  select m.pos_role into v_role
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.organization_id = public.current_org_id()
    and m.status = 'active'
  limit 1;
  return v_role;
end $$;

create or replace function public.is_member_with_role(p_org_id uuid, p_min_role text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare user_role text; role_rank int; min_rank int;
begin
  select m.pos_role into user_role
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.organization_id = p_org_id
    and m.status = 'active'
  limit 1;
  if user_role is null then return false; end if;
  role_rank := case user_role when 'owner' then 4 when 'manager' then 3 when 'cashier' then 2 when 'viewer' then 1 else 0 end;
  min_rank := case p_min_role when 'owner' then 4 when 'manager' then 3 when 'cashier' then 2 when 'viewer' then 1 else 0 end;
  return role_rank >= min_rank;
end $$;

create or replace function public.canonical_json(input jsonb)
returns text language sql immutable set search_path = ''
as $$
  with recursive walk as (select input as value),
  sorted as (
    select case jsonb_typeof(value)
      when 'object' then (
        select coalesce('{' || string_agg(to_jsonb(k)::text || ':' || public.canonical_json(value -> k), ',' order by k) || '}', '{}')
        from jsonb_object_keys(value) k)
      when 'array' then (
        select coalesce('[' || string_agg(public.canonical_json(elem), ',' order by ord) || ']', '[]')
        from jsonb_array_elements(value) with ordinality as t(elem, ord))
      else value::text
    end as txt
    from walk)
  select txt from sorted
$$;

-- 3. venues (POS-only second tenancy axis).
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

drop policy if exists "venues_read_members" on public.venues;
create policy "venues_read_members" on public.venues for select
  using (exists (select 1 from public.organization_members m
    where m.organization_id = venues.org_id and m.user_id = (select auth.uid()) and m.status = 'active'));

drop policy if exists "venues_write_managers" on public.venues;
create policy "venues_write_managers" on public.venues for all
  using (public.is_member_with_role(venues.org_id, 'manager'))
  with check (public.is_member_with_role(venues.org_id, 'manager'));

-- 4. set_session_venue RPC (references venues, created above).
create or replace function public.set_session_venue(p_venue_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.venues v
    join public.organization_members m on m.organization_id = v.org_id
    where v.id = p_venue_id and m.user_id = (select auth.uid()) and m.status = 'active'
  ) then
    raise exception 'not a member of this venue';
  end if;
  perform set_config('request.venue_id', p_venue_id::text, true);
end $$;
revoke execute on function public.set_session_venue(uuid) from public;
grant execute on function public.set_session_venue(uuid) to authenticated;

-- 5. manager-PIN partial index.
create index if not exists organization_members_manager_pin_idx
  on public.organization_members (organization_id)
  where manager_pin_hash is not null;

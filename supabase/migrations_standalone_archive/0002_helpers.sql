-- Phase 1 Foundation — 0002 RLS helper functions
-- All helpers are SECURITY DEFINER with locked search_path to avoid CVE-2018-1058
-- style search_path injection.
--
-- SHARED-DB NOTE: this POS now lives in the BBQ Architect Supabase project.
-- The tenant tables are `organizations` + `organization_members` (NOT the POS's
-- old `orgs`/`memberships`). `public.current_org_id()` already exists there
-- (it reads the active organization_members row) and is relied on by BBQ's RLS
-- across the whole database — we DO NOT redefine it here. POS membership role
-- lives in `organization_members.pos_role` (added in 0003) so it never collides
-- with BBQ's free-text `role`.

-- Returns the venue_id from session setting (set by middleware per request).
-- Most DAL code passes venue_id explicitly; this is the fallback for
-- database-side functions called from triggers.
create or replace function public.current_venue_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(current_setting('request.venue_id', true), '')::uuid
$$;

-- Returns the current user's POS role for the active org.
-- plpgsql (not sql) so the body — which references public.organization_members
-- and public.current_org_id() — is parsed at call time, not at create time.
create or replace function public.current_role_in_org()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select m.pos_role into v_role
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.organization_id = public.current_org_id()
    and m.status = 'active'
  limit 1;
  return v_role;
end
$$;

-- "Does the current user have at least POS role X in org Y?"  Used in every
-- POS write RLS policy. Ranking: viewer=1, cashier=2, manager=3, owner=4.
-- Reads organization_members.pos_role (POS-specific, separate from BBQ's role).
create or replace function public.is_member_with_role(p_org_id uuid, p_min_role text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  user_role text;
  role_rank int;
  min_rank int;
begin
  select m.pos_role into user_role
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.organization_id = p_org_id
    and m.status = 'active'
  limit 1;

  if user_role is null then return false; end if;

  role_rank := case user_role
    when 'owner' then 4
    when 'manager' then 3
    when 'cashier' then 2
    when 'viewer' then 1
    else 0
  end;
  min_rank := case p_min_role
    when 'owner' then 4
    when 'manager' then 3
    when 'cashier' then 2
    when 'viewer' then 1
    else 0
  end;

  return role_rank >= min_rank;
end
$$;

-- Canonical JSON for the SBA Fase 4 hash chain. MUST be deterministic across
-- versions or the chain breaks. v1 sorts keys recursively.
create or replace function public.canonical_json(input jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with recursive walk as (
    select input as value
  ),
  sorted as (
    select case jsonb_typeof(value)
      when 'object' then (
        select coalesce(
          '{' || string_agg(
            to_jsonb(k)::text || ':' || public.canonical_json(value -> k),
            ',' order by k
          ) || '}',
          '{}'
        )
        from jsonb_object_keys(value) k
      )
      when 'array' then (
        select coalesce(
          '[' || string_agg(public.canonical_json(elem), ',' order by ord) || ']',
          '[]'
        )
        from jsonb_array_elements(value) with ordinality as t(elem, ord)
      )
      else value::text
    end as txt
    from walk
  )
  select txt from sorted
$$;

-- Public RPC: set the venue_id for this DB session (used by Server Actions
-- when they need RLS / trigger code to see the active venue).
create or replace function public.set_session_venue(p_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Verify the caller is a member of the org owning this venue
  if not exists (
    select 1
    from public.venues v
    join public.organization_members m on m.organization_id = v.org_id
    where v.id = p_venue_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  ) then
    raise exception 'not a member of this venue';
  end if;
  perform set_config('request.venue_id', p_venue_id::text, true);
end
$$;

revoke execute on function public.set_session_venue(uuid) from public;
grant execute on function public.set_session_venue(uuid) to authenticated;

-- Phase 1 Foundation — 0002 RLS helper functions
-- All helpers are SECURITY DEFINER with locked search_path to avoid CVE-2018-1058
-- style search_path injection.

-- Returns the org_id from the JWT custom claim set by custom_access_token_hook.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'org_id',
      ''
    ),
    ''
  )::uuid
$$;

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

-- Returns the current user's role for the active org (from JWT).
create or replace function public.current_role_in_org()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role::text
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.org_id = public.current_org_id()
  limit 1
$$;

-- "Does the current user have at least role X in org Y?"  Used in every
-- write RLS policy. Ranking: viewer=1, cashier=2, manager=3, owner=4.
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
  select role::text into user_role
  from public.memberships
  where user_id = (select auth.uid()) and org_id = p_org_id
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
    join public.memberships m on m.org_id = v.org_id
    where v.id = p_venue_id
      and m.user_id = (select auth.uid())
  ) then
    raise exception 'not a member of this venue';
  end if;
  perform set_config('request.venue_id', p_venue_id::text, true);
end
$$;

revoke execute on function public.set_session_venue(uuid) from public;
grant execute on function public.set_session_venue(uuid) to authenticated;

-- POS Phase B1: SBA hash-chain audit (renamed audit_log -> pos_audit_log to
-- avoid colliding with BBQ's audit_log), webhook inbox, theme settings.
-- ADDITIVE: all new objects. canonical_json() already exists (Phase A).

-- canonical_json validators.
create or replace function public.canonical_json_safe(input jsonb)
returns boolean language sql immutable set search_path = ''
as $$
  select not jsonb_path_exists(input, 'strict $.** ? (@.type() == "number" && @ != @.floor())')
$$;

create or replace function public.current_canonical_json_version()
returns text language sql immutable set search_path = ''
as $$ select '2026-05-18-a'::text $$;

-- pos_audit_log: table + generated payload_canonical + safety constraints.
create table if not exists public.pos_audit_log (
  seq_id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete restrict,
  venue_id uuid references public.venues(id) on delete set null,
  actor_user_id uuid,
  actor_terminal_id uuid,
  event_type text not null,
  payload jsonb not null,
  payload_canonical text generated always as (public.canonical_json(payload)) stored,
  hash_prev text,
  hash_curr text not null default '',
  created_at timestamptz not null default now(),
  constraint pos_audit_log_payload_canonical_safe check (public.canonical_json_safe(payload)),
  constraint pos_audit_log_payload_has_version check (payload ? 'canonical_json_version')
);

create or replace function public.pos_audit_log_hash_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare prev_hash text; canon text;
begin
  canon := public.canonical_json(NEW.payload);
  perform pg_advisory_xact_lock(hashtext('pos_audit_log:' || NEW.org_id::text));
  select hash_curr into prev_hash from public.pos_audit_log
    where org_id = NEW.org_id order by seq_id desc limit 1;
  NEW.hash_prev := coalesce(prev_hash, '');
  NEW.hash_curr := encode(extensions.digest(
    NEW.seq_id::text || '|' || canon || '|' || coalesce(prev_hash, ''), 'sha256'), 'hex');
  return NEW;
end $$;

drop trigger if exists pos_audit_log_hash_before_insert on public.pos_audit_log;
create trigger pos_audit_log_hash_before_insert
  before insert on public.pos_audit_log
  for each row execute function public.pos_audit_log_hash_trigger();

revoke update on public.pos_audit_log from authenticated, anon;
revoke delete on public.pos_audit_log from authenticated, anon;
revoke insert on public.pos_audit_log from anon, authenticated;

alter table public.pos_audit_log enable row level security;
drop policy if exists "pos_audit_log_read_managers" on public.pos_audit_log;
create policy "pos_audit_log_read_managers" on public.pos_audit_log for select
  using (public.is_member_with_role(org_id, 'manager'));

create index if not exists pos_audit_log_org_seq_idx on public.pos_audit_log (org_id, seq_id);
create index if not exists pos_audit_log_venue_time_idx on public.pos_audit_log (venue_id, created_at desc);
create index if not exists pos_audit_log_event_type_idx on public.pos_audit_log (org_id, event_type, created_at desc);

-- write_audit_log RPC — only path to insert; seals the chain via trigger.
create or replace function public.write_audit_log(
  p_org_id uuid, p_venue_id uuid, p_actor_user_id uuid,
  p_actor_terminal_id uuid, p_event_type text, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare new_seq bigint;
begin
  perform pg_advisory_xact_lock(hashtext('pos_audit_log:' || p_org_id::text));
  insert into public.pos_audit_log (org_id, venue_id, actor_user_id, actor_terminal_id, event_type, payload)
  values (p_org_id, p_venue_id, p_actor_user_id, p_actor_terminal_id, p_event_type, p_payload)
  returning seq_id into new_seq;
  return new_seq;
end $$;

revoke execute on function public.write_audit_log(uuid, uuid, uuid, uuid, text, jsonb) from public, authenticated, anon;
grant execute on function public.write_audit_log(uuid, uuid, uuid, uuid, text, jsonb) to service_role;
revoke insert on public.pos_audit_log from service_role;

-- webhook_events — generic provider dedup inbox.
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mollie','moneybird','resend')),
  event_id text not null,
  event_type text,
  org_id uuid references public.organizations(id) on delete set null,
  raw_body text check (raw_body is null or length(raw_body) < 1000000),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
create index if not exists webhook_events_provider_time_idx on public.webhook_events (provider, received_at desc);
create index if not exists webhook_events_org_time_idx on public.webhook_events (org_id, received_at desc);
create index if not exists webhook_events_unprocessed_idx on public.webhook_events (provider, received_at) where processed_at is null;
alter table public.webhook_events enable row level security;
drop policy if exists "webhook_events_read_managers" on public.webhook_events;
create policy "webhook_events_read_managers" on public.webhook_events for select
  using (org_id is not null and public.is_member_with_role(org_id, 'manager'));

-- org_theme_settings — white-label per-tenant theme.
create table if not exists public.org_theme_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  preset text not null default 'hopbites' check (preset in
    ('hopbites','neutral','warm-grey','blueprint','midnight','spring','autumn','festival')),
  token_brand text, token_surface text, token_surface_fg text,
  token_accent text, token_border text,
  brand_name text, brand_logo_url text,
  updated_at timestamptz not null default now()
);
alter table public.org_theme_settings enable row level security;
drop policy if exists "org_theme_settings_read_members" on public.org_theme_settings;
create policy "org_theme_settings_read_members" on public.org_theme_settings for select
  using (exists (select 1 from public.organization_members m
    where m.organization_id = org_theme_settings.org_id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists "org_theme_settings_write_managers" on public.org_theme_settings;
create policy "org_theme_settings_write_managers" on public.org_theme_settings for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

create or replace function public.touch_org_theme_settings()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin NEW.updated_at := now(); return NEW; end $$;
drop trigger if exists org_theme_settings_touch on public.org_theme_settings;
create trigger org_theme_settings_touch before update on public.org_theme_settings
  for each row execute function public.touch_org_theme_settings();

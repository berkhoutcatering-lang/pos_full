-- Phase 4 KDS+CFD — 0017 station routing
-- Foodtruck Schoonoord is single-station ('grill'); the column ships
-- ready for multi-station venues. Snapshot into pos_order_items at order
-- placement so menu edits don't retroactively re-route in-flight orders.

alter table public.pos_menu_items
  add column station text not null default 'grill';

alter table public.pos_order_items
  add column station text not null default 'grill';

create index pos_order_items_station_idx
  on public.pos_order_items (org_id, venue_id, station);

-- venue-level KDS config
create table public.venue_kds_settings (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  stations text[] not null default array['grill'],
  default_station text not null default 'grill',
  auto_print_on_bump boolean not null default true,
  bell_on_ready boolean not null default true,
  updated_at timestamptz not null default now()
);

create index venue_kds_settings_org_idx on public.venue_kds_settings (org_id);

alter table public.venue_kds_settings enable row level security;

create policy "venue_kds_settings_read_members" on public.venue_kds_settings for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = venue_kds_settings.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "venue_kds_settings_write_managers" on public.venue_kds_settings for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

create or replace function public.touch_venue_kds_settings()
returns trigger language plpgsql
security definer set search_path = '' as $$
begin NEW.updated_at := now(); return NEW; end
$$;

create trigger venue_kds_settings_touch
  before update on public.venue_kds_settings
  for each row execute function public.touch_venue_kds_settings();

-- Seed default settings for the Hop & Bites dev org venues.
insert into public.venue_kds_settings (venue_id, org_id, stations, default_station)
select v.id, v.org_id, array['grill'], 'grill'
from public.venues v
where v.org_id = '00000000-0000-0000-0000-000000000001'::uuid
on conflict (venue_id) do nothing;

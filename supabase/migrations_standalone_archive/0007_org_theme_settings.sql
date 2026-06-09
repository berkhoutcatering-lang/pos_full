-- Phase 1 Foundation — 0007 org_theme_settings
-- White-label per-tenant theme. Picks one of 8 presets; optional OKLCH token
-- overrides feed into the runtime CSS variables on <html data-theme="...">.
-- Build-time Tailwind v4 generates default tokens; runtime layer overrides.

create table public.org_theme_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  preset text not null default 'hopbites' check (preset in (
    'hopbites','neutral','warm-grey','blueprint','midnight','spring','autumn','festival'
  )),
  -- Optional per-token OKLCH overrides (e.g. 'oklch(0.65 0.22 35)').
  token_brand text,
  token_surface text,
  token_surface_fg text,
  token_accent text,
  token_border text,
  brand_name text,
  brand_logo_url text,
  updated_at timestamptz not null default now()
);

alter table public.org_theme_settings enable row level security;

create policy "org_theme_settings_read_members"
  on public.org_theme_settings for select
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = org_theme_settings.org_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "org_theme_settings_write_managers"
  on public.org_theme_settings for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

-- Keep updated_at fresh
create or replace function public.touch_org_theme_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  NEW.updated_at := now();
  return NEW;
end
$$;

create trigger org_theme_settings_touch
  before update on public.org_theme_settings
  for each row
  execute function public.touch_org_theme_settings();

-- LOCAL-DEV seed. Runs after `supabase db reset` (shim + pos_phase_* applied).
-- Uses the shared-DB tenant model: organizations + organization_members + venues.
--
-- Do NOT run this against the shared production DB — there the real "Hop & Bites"
-- org/venue/theme already exist and the POS phase-F seed already set Sam's
-- pos_role + venue.

insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Hop & Bites (dev)', 'hop-en-bites-dev')
on conflict (id) do nothing;

update public.organizations set pos_tier = 'pro'
where id = '00000000-0000-0000-0000-000000000001';

insert into public.venues (id, org_id, name, slug)
values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Foodtruck Schoonoord', 'foodtruck-schoonoord'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Festivalplaats',       'festival')
on conflict (id) do nothing;

insert into public.venue_kds_settings (venue_id, org_id, stations, default_station)
values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', array['grill'], 'grill'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', array['grill'], 'grill')
on conflict (venue_id) do nothing;

insert into public.org_theme_settings (org_id, preset, brand_name)
values ('00000000-0000-0000-0000-000000000001', 'hopbites', 'Hop & Bites')
on conflict (org_id) do nothing;

-- After signing up via Supabase Auth, attach your dev user as POS owner
-- (scripts/seed-dev-user.mjs does this automatically for sam@hopbites.dev):
--
-- insert into public.organization_members (organization_id, user_id, role, status, pos_role)
--   values ('00000000-0000-0000-0000-000000000001', '<auth-user-id>', 'Admin', 'active', 'owner');

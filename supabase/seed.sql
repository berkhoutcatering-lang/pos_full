-- Phase 1 Foundation — dev seed
-- Run AFTER `supabase db push`. Creates one dev org with two venues + a
-- default theme row. Attach Sam as owner manually after signing up via
-- /login (the auth.users row is created by Supabase Auth, not by us).

insert into public.orgs (id, slug, name, kvk_number, btw_number, tier)
values (
  '00000000-0000-0000-0000-000000000001',
  'hop-en-bites-dev',
  'Hop & Bites (dev)',
  '12345678',
  'NL000000000B01',
  'pro'
)
on conflict (id) do nothing;

insert into public.venues (id, org_id, name, slug)
values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Foodtruck Schoonoord', 'foodtruck-schoonoord'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Festivalplaats',       'festival')
on conflict (id) do nothing;

insert into public.org_theme_settings (org_id, preset, brand_name)
values ('00000000-0000-0000-0000-000000000001', 'hopbites', 'Hop & Bites')
on conflict (org_id) do nothing;

-- After signing up via Supabase Auth, attach yourself as owner. Replace the
-- placeholder UUID with the auth.users.id from the Auth dashboard.
--
-- insert into public.memberships (user_id, org_id, role) values
--   ('<your-auth-user-id>', '00000000-0000-0000-0000-000000000001', 'owner');

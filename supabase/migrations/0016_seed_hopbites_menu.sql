-- Phase 3 Kassa — 0016 seed menu for the Hop & Bites dev org / Foodtruck
-- Schoonoord venue. Hits every BTW edge case so the btw-classifier + the
-- pricing engine tests have a realistic fixture.
--
-- The btw-classifier MUST be run against this file when items are added or
-- changed (per WERK-MODE). BTW classes here are AUTHORITATIVE — never
-- inferred at runtime.

with v as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as org_id,
    '00000000-0000-0000-0000-000000000010'::uuid as venue_id
)

-- BBQ broodjes (food_9)
insert into public.pos_menu_items
  (org_id, venue_id, name, category, base_price_cents, btw_class, sort_order)
select v.org_id, v.venue_id, name, 'broodjes', price, 'food_9'::public.btw_class, sort
from v, (values
  ('Broodje Pulled Pork',         950, 10),
  ('Broodje Brisket',            1095, 20),
  ('Broodje Smoked Chicken',      895, 30),
  ('Broodje Pulled Mushroom',     895, 40)
) as t(name, price, sort)
on conflict (org_id, venue_id, name) do nothing;

-- Sides (food_9)
insert into public.pos_menu_items
  (org_id, venue_id, name, category, base_price_cents, btw_class, sort_order)
select v.org_id, v.venue_id, name, 'sides', price, 'food_9'::public.btw_class, sort
from v, (values
  ('Frietjes',                    450, 10),
  ('Coleslaw',                    395, 20),
  ('Mac and Cheese',              495, 30)
) as t(name, price, sort)
on conflict (org_id, venue_id, name) do nothing;

-- Frisdrank / non-alc (food_9 — NL frisdrank laag tarief)
insert into public.pos_menu_items
  (org_id, venue_id, name, category, base_price_cents, btw_class, sort_order)
select v.org_id, v.venue_id, name, 'frisdrank', price, 'food_9'::public.btw_class, sort
from v, (values
  ('Coca-Cola',                   300, 10),
  ('Fanta Orange',                300, 20),
  ('Spa Blauw',                   275, 30)
) as t(name, price, sort)
on conflict (org_id, venue_id, name) do nothing;

-- Alcoholvrij bier (nonalc_beer_9 — 9% laag tarief)
insert into public.pos_menu_items
  (org_id, venue_id, name, category, base_price_cents, btw_class, sort_order)
select v.org_id, v.venue_id, name, 'bier', price, 'nonalc_beer_9'::public.btw_class, sort
from v, (values
  ('Heineken 0.0',                395, 10),
  ('Brand 0.0',                   395, 20)
) as t(name, price, sort)
on conflict (org_id, venue_id, name) do nothing;

-- Energy drinks (soda_21 — 21% hoog tarief, NL 2024)
insert into public.pos_menu_items
  (org_id, venue_id, name, category, base_price_cents, btw_class, sort_order)
select v.org_id, v.venue_id, name, 'energy', price, 'soda_21'::public.btw_class, sort
from v, (values
  ('Red Bull',                    395, 10),
  ('Monster Energy',              395, 20)
) as t(name, price, sort)
on conflict (org_id, venue_id, name) do nothing;

-- Bier + wijn + cocktails (alcohol_21)
insert into public.pos_menu_items
  (org_id, venue_id, name, category, base_price_cents, btw_class, sort_order)
select v.org_id, v.venue_id, name, 'alcohol', price, 'alcohol_21'::public.btw_class, sort
from v, (values
  ('Heineken',                    450, 10),
  ('Brand Pils',                  450, 20),
  ('Huiswijn rood (glas)',        500, 30),
  ('Huiswijn wit (glas)',         500, 40),
  ('Mojito',                      850, 50),
  ('Aperol Spritz',               850, 60)
) as t(name, price, sort)
on conflict (org_id, venue_id, name) do nothing;

-- Statiegeld (deposit_0 — 0%)
insert into public.pos_menu_items
  (org_id, venue_id, name, category, base_price_cents, btw_class, is_discountable, sort_order)
select v.org_id, v.venue_id, name, 'statiegeld', price, 'deposit_0'::public.btw_class, false, sort
from v, (values
  ('Statiegeld plastic beker',    25, 10),
  ('Statiegeld blik',             15, 20)
) as t(name, price, sort)
on conflict (org_id, venue_id, name) do nothing;

-- Service charge (service_0 — 0%, niet kortbaar)
insert into public.pos_menu_items
  (org_id, venue_id, name, category, base_price_cents, btw_class, is_discountable, sort_order)
select v.org_id, v.venue_id, name, 'service', price, 'service_0'::public.btw_class, false, sort
from v, (values
  ('Fooi 10%',                    0, 10)
) as t(name, price, sort)
on conflict (org_id, venue_id, name) do nothing;

-- Modifier group: Saus voor de broodjes
insert into public.pos_modifier_groups
  (org_id, venue_id, name, min_select, max_select, options)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000010'::uuid,
  'Saus', 0, 2,
  '[
    {"id":"saus-bbq","name":"BBQ saus","surcharge_cents":0},
    {"id":"saus-chipotle","name":"Chipotle mayo","surcharge_cents":50},
    {"id":"saus-knoflook","name":"Knoflook saus","surcharge_cents":50}
  ]'::jsonb
on conflict (org_id, venue_id, name) do nothing;

-- Combo: 2 broodjes voor 17.00 (saves ~2 EUR vs single price)
insert into public.pos_combos
  (org_id, venue_id, name, trigger_item_ids, trigger_min_qty, discount_cents)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000010'::uuid,
  '2 broodjes voor 17,00',
  array(
    select id from public.pos_menu_items
    where org_id = '00000000-0000-0000-0000-000000000001'::uuid
      and venue_id = '00000000-0000-0000-0000-000000000010'::uuid
      and category = 'broodjes'
    order by sort_order limit 2
  ),
  '{}'::jsonb,
  200
where exists (
  select 1 from public.pos_menu_items
  where org_id = '00000000-0000-0000-0000-000000000001'::uuid
    and category = 'broodjes'
)
on conflict (org_id, venue_id, name) do nothing;

-- Round A — allergens kolom op pos_menu_items.
-- EU 1169/2011 verplicht dat de 14 wettelijke allergens per item bekend
-- zijn voor (1) klanten op de bon en CFD, (2) keuken bij combo-builder.
-- Hop & Bites BBQ menu raakt typisch gluten, ei, lupine, mosterd, soja,
-- sesam, melk, selderij, sulfiet, noten. NIET AI-derived.

-- 14 allergen-codes per EU 1169/2011 bijlage II.
create type public.allergen as enum (
  'gluten',         -- granen (tarwe, rogge, gerst, haver, spelt)
  'crustacean',     -- schaaldieren
  'egg',            -- ei
  'fish',           -- vis
  'peanut',         -- pinda
  'soy',            -- soja
  'milk',           -- melk (incl. lactose)
  'tree_nut',       -- noten (amandel, hazelnoot, walnoot, cashew, pecan, paranoot, pistache, macadamia)
  'celery',         -- selderij
  'mustard',        -- mosterd
  'sesame',         -- sesam
  'sulfite',        -- zwaveldioxide + sulfieten > 10 mg/kg
  'lupin',          -- lupine
  'mollusc'         -- weekdieren
);

alter table public.pos_menu_items
  add column allergens public.allergen[] not null default '{}';

-- Snapshot kolom op pos_order_items zodat een latere menu-edit nooit een
-- historische bon raakt (bewaarplicht, Pillar 2).
alter table public.pos_order_items
  add column allergens_snapshot public.allergen[] not null default '{}';

-- Performance: filteren op "bevat noten / gluten / etc." voor BEO of
-- customer-bon lookup is een GIN-index waardig.
create index pos_menu_items_allergens_gin
  on public.pos_menu_items using gin (allergens);

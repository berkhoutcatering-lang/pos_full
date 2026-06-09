-- Operational admin surface — stock, availability override, temp price override.
-- Pillar #4 Foodtruck-First + Pillar #1 Pi-Edge Cloud-Truth.
--
-- Manager kan tijdens een rush in 2 taps: voorraad bijhouden,
-- "op zetten", prijs tijdelijk wijzigen. Werkt via Pi-bridge LAN bij
-- Supabase-outage. Het volledig menu-editen blijft strategic (cloud).

alter table public.pos_menu_items
  -- NULL = ongelimiteerd. 0 = uitverkocht (effectief hetzelfde als
  -- is_available_override = false maar telt mee voor de aftrek-log).
  add column stock_qty int
    check (stock_qty is null or stock_qty >= 0),

  -- Manager-driven snel-toggle. NULL = volgt is_active. true/false override.
  add column is_available_override boolean,

  -- Tijdelijke prijswijziging (rush-aanbieding, prijscorrectie).
  -- NULL = gebruik base_price_cents.
  add column price_override_cents int
    check (price_override_cents is null or price_override_cents >= 0),
  add column price_override_expires_at timestamptz,
  add column price_override_set_by uuid references auth.users(id) on delete set null;

-- Snelle index voor /pos filtering: items zichtbaar = is_active AND
-- (is_available_override IS NOT FALSE) AND (stock_qty IS NULL OR stock_qty > 0)
create index pos_menu_items_available_idx
  on public.pos_menu_items (org_id, venue_id)
  where is_active
    and (is_available_override is not false)
    and (stock_qty is null or stock_qty > 0);

-- View die /pos en de Pi PGlite-cache kunnen gebruiken voor de
-- effective_price_cents zonder elke client de logica te repliceren.
create or replace view public.pos_menu_items_effective
with (security_invoker = true)
as
select
  i.id,
  i.org_id,
  i.venue_id,
  i.name,
  i.category,
  i.base_price_cents,
  -- Effective price: price_override als gezet + niet verlopen, anders base.
  case
    when i.price_override_cents is not null
      and (i.price_override_expires_at is null or i.price_override_expires_at > now())
    then i.price_override_cents
    else i.base_price_cents
  end as effective_price_cents,
  i.btw_class,
  i.is_discountable,
  i.available_modifier_group_ids,
  i.image_url,
  i.sort_order,
  i.stock_qty,
  i.is_available_override,
  -- Effective availability: actief én niet manager-uit én niet uitverkocht.
  case
    when not i.is_active then false
    when i.is_available_override is false then false
    when i.stock_qty is not null and i.stock_qty <= 0 then false
    else true
  end as is_available
from public.pos_menu_items i;

-- Atomic stock decrement RPC — kassa roept dit aan bij order-place om
-- voorraad te decrementen. Zelfde advisory lock pattern als audit_log
-- om dubbele decrements onder rush te voorkomen.
create or replace function public.decrement_stock(
  p_item_id uuid,
  p_qty int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_stock int;
begin
  perform pg_advisory_xact_lock(hashtext('stock:' || p_item_id::text));
  update public.pos_menu_items
    set stock_qty = greatest(stock_qty - p_qty, 0),
        updated_at = now()
    where id = p_item_id
      and stock_qty is not null
    returning stock_qty into new_stock;
  return coalesce(new_stock, -1);  -- -1 = ongelimiteerd, geen decrement
end
$$;

revoke execute on function public.decrement_stock(uuid, int) from public;
grant execute on function public.decrement_stock(uuid, int) to authenticated, service_role;

-- Realtime publication zodat /pos client direct updates ziet als manager
-- een item op "uit" zet of stock 0 bereikt.
alter publication supabase_realtime add table public.pos_menu_items;

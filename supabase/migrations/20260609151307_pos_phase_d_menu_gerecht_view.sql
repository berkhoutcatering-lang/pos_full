-- POS Phase D: pos_menu_items_effective inherits name/image from the linked
-- gerecht (the shared catalog). pos_menu_items keeps its own price/btw/station;
-- gerecht_id is the catalog link. drop+create because column order changes
-- (gerecht_id is added before name). security_invoker keeps RLS on both tables.
drop view if exists public.pos_menu_items_effective;
create view public.pos_menu_items_effective with (security_invoker = true) as
select
  i.id, i.org_id, i.venue_id, i.gerecht_id,
  coalesce(nullif(i.name, ''), g.naam) as name,
  i.category,
  i.base_price_cents,
  case when i.price_override_cents is not null
       and (i.price_override_expires_at is null or i.price_override_expires_at > now())
    then i.price_override_cents else i.base_price_cents end as effective_price_cents,
  i.btw_class, i.is_discountable, i.available_modifier_group_ids,
  coalesce(i.image_url, g.foto_url) as image_url,
  i.sort_order, i.stock_qty, i.is_available_override,
  case when not i.is_active then false
       when i.is_available_override is false then false
       when i.stock_qty is not null and i.stock_qty <= 0 then false
       else true end as is_available
from public.pos_menu_items i
left join public.gerechten g on g.id = i.gerecht_id;

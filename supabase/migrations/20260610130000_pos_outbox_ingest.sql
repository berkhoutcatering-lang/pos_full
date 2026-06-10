-- Outbox-ingest RPC's: de Pi-bridge flusht order-payloads die NIET 1-op-1
-- op de tabelkolommen passen (order_id vs id, items[], totals{}). Directe
-- PostgREST-inserts faalden daardoor stil (poison-pill na 10 retries) en
-- offline geplaatste orders bereikten Supabase nooit. Deze functies
-- vertalen de payload server-side, idempotent op idempotency_key.
-- Alleen service_role (de Pi) mag ze aanroepen.

create or replace function public.ingest_pos_order(p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid := (p->>'order_id')::uuid;
  v_org uuid := (p->>'org_id')::uuid;
  v_venue uuid := (p->>'venue_id')::uuid;
  it jsonb;
  v_pos int := 0;
  v_name text; v_cat text; v_station text;
  v_mod_per_unit int; v_qty int; v_unit int; v_rate int;
  v_incl int; v_excl int;
begin
  if p->>'idempotency_key' is null then
    raise exception 'idempotency_key ontbreekt';
  end if;
  if exists (select 1 from public.pos_orders where idempotency_key = p->>'idempotency_key') then
    return; -- replay van een al geflushte order
  end if;

  insert into public.pos_orders (
    id, org_id, venue_id, idempotency_key, daily_seq, ordered_label,
    source, status, created_by_terminal_id,
    subtotal_cents, discount_cents, total_excl_cents, total_btw_cents, total_incl_cents,
    customer_name, placed_at, paid_at
  ) values (
    v_order_id, v_org, v_venue, p->>'idempotency_key',
    nullif(p->>'daily_seq', '')::int, nullif(p->>'ordered_label', ''),
    'kassa', 'placed', nullif(p->>'terminal_id', '')::uuid,
    coalesce((p#>>'{totals,subtotal_cents}')::int, (p#>>'{totals,incl_cents}')::int),
    coalesce((p#>>'{totals,discount_cents}')::int, 0),
    (p#>>'{totals,excl_cents}')::int,
    (p#>>'{totals,btw_cents}')::int,
    (p#>>'{totals,incl_cents}')::int,
    nullif(p->>'customer_label', ''),
    coalesce(nullif(p->>'placed_at', '')::timestamptz, now()),
    now()
  )
  on conflict (idempotency_key) do nothing;

  for it in select * from jsonb_array_elements(p->'items') loop
    select m.name, m.category, m.station into v_name, v_cat, v_station
      from public.pos_menu_items m
      where m.id = (it->>'menu_item_id')::uuid;
    v_qty := (it->>'qty')::int;
    v_unit := (it->>'unit_price_cents')::int;
    select coalesce(sum((mo->>'price_delta_cents')::int), 0) into v_mod_per_unit
      from jsonb_array_elements(coalesce(it->'modifiers', '[]'::jsonb)) mo;
    v_rate := case it->>'btw_class'
      when 'food_9' then 9
      when 'nonalc_beer_9' then 9
      when 'deposit_0' then 0
      when 'service_0' then 0
      else 21
    end;
    v_incl := v_qty * (v_unit + v_mod_per_unit);
    v_excl := round(v_incl / (1 + v_rate / 100.0))::int;

    insert into public.pos_order_items (
      order_id, org_id, venue_id, position, menu_item_id, name, category,
      qty, unit_price_cents, modifier_total_cents,
      btw_class, btw_rate, line_excl_cents, line_btw_cents, line_incl_cents,
      modifiers_json, notes, station
    ) values (
      v_order_id, v_org, v_venue, v_pos, (it->>'menu_item_id')::uuid,
      coalesce(v_name, 'Item'), v_cat,
      v_qty, v_unit, v_qty * v_mod_per_unit,
      (it->>'btw_class')::public.btw_class, v_rate,
      v_excl, v_incl - v_excl, v_incl,
      coalesce(it->'modifiers', '[]'::jsonb), nullif(it->>'note', ''),
      coalesce(v_station, 'grill')
    );
    v_pos := v_pos + 1;
  end loop;
end $$;

revoke all on function public.ingest_pos_order(jsonb) from public;
revoke all on function public.ingest_pos_order(jsonb) from anon, authenticated;
grant execute on function public.ingest_pos_order(jsonb) to service_role;

create or replace function public.ingest_pos_state_change(p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_order uuid := (p->>'order_id')::uuid;
  v_to public.pos_order_status := (p->>'state')::public.pos_order_status;
  v_org uuid; v_venue uuid;
begin
  if exists (select 1 from public.pos_order_state_changes where idempotency_key = p->>'idempotency_key') then
    return;
  end if;
  select org_id, venue_id into v_org, v_venue from public.pos_orders where id = v_order;
  if v_org is null then
    -- Order zelf nog niet geflusht: laat de outbox-retry het later opnieuw
    -- proberen (FIFO: de insert komt normaal eerst).
    raise exception 'order % nog niet aanwezig', v_order;
  end if;

  insert into public.pos_order_state_changes (idempotency_key, order_id, org_id, venue_id, to_state, actor_terminal_id)
  values (p->>'idempotency_key', v_order, v_org, v_venue, v_to, nullif(p->>'terminal_id', '')::uuid)
  on conflict (idempotency_key) do nothing;

  update public.pos_orders set
    status = v_to,
    prepared_at = case
      when v_to = 'preparing' then now()
      when v_to = 'placed' then null
      else prepared_at
    end,
    served_at = case when v_to = 'served' then now() else served_at end,
    voided_at = case when v_to = 'voided' then now() else voided_at end
  where id = v_order;
end $$;

revoke all on function public.ingest_pos_state_change(jsonb) from public;
revoke all on function public.ingest_pos_state_change(jsonb) from anon, authenticated;
grant execute on function public.ingest_pos_state_change(jsonb) to service_role;

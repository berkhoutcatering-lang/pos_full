-- Betalingen belandden nergens.
--
-- pos_payments bestond sinds fase B2 en wordt gelezen door de dagafsluiting en
-- de AVG-export, maar er was geen enkele plek die er een rij in schreef. Gevolg:
-- het dashboard kon contant en pin niet splitsen, de dagafsluiting evenmin, en
-- het transactienummer van de terminal — het enige dat een betaling aan een
-- bankafschrift koppelt — bleef in de audit-log hangen in plaats van in de
-- boeken.
--
-- Zelfde vorm als ingest_pos_order: de Pi zet een rij in zijn outbox en de
-- flush-worker roept dit aan zodra Supabase bereikbaar is. Idempotent op
-- idempotency_key, want de outbox mag opnieuw aanbieden.

create or replace function public.ingest_pos_payment(p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_order uuid := (p->>'order_id')::uuid;
  v_org uuid := (p->>'org_id')::uuid;
  v_venue uuid := (p->>'venue_id')::uuid;
  v_status public.pos_payment_status := coalesce(nullif(p->>'status', ''), 'captured')::public.pos_payment_status;
begin
  if p->>'idempotency_key' is null then
    raise exception 'idempotency_key ontbreekt';
  end if;

  -- Replay van een al geflushte betaling. Stil teruggeven, niet falen: de
  -- outbox biedt bewust opnieuw aan als hij ons antwoord niet zag.
  if exists (select 1 from public.pos_payments where idempotency_key = p->>'idempotency_key') then
    return;
  end if;

  -- De bestelling kan nog in de wachtrij staan als de flush-volgorde anders
  -- liep. Dan is dit geen fout maar te vroeg: de outbox probeert het opnieuw,
  -- en de betaling landt zodra de bon er is.
  if not exists (select 1 from public.pos_orders where id = v_order and org_id = v_org and venue_id = v_venue) then
    raise exception 'order % bestaat nog niet', v_order using errcode = 'foreign_key_violation';
  end if;

  insert into public.pos_payments (
    order_id, org_id, venue_id, idempotency_key, method, status, amount_cents,
    mypos_transaction_id, mollie_payment_id,
    cash_given_cents, cash_change_cents,
    authorized_at, captured_at, failed_at, failure_reason
  ) values (
    v_order, v_org, v_venue, p->>'idempotency_key',
    (p->>'method')::public.pos_payment_method,
    v_status,
    (p->>'amount_cents')::int,
    nullif(p->>'mypos_transaction_id', ''),
    nullif(p->>'mollie_payment_id', ''),
    nullif(p->>'cash_given_cents', '')::int,
    nullif(p->>'cash_change_cents', '')::int,
    nullif(p->>'authorized_at', '')::timestamptz,
    case when v_status = 'captured'
         then coalesce(nullif(p->>'captured_at', '')::timestamptz, now())
         else nullif(p->>'captured_at', '')::timestamptz end,
    nullif(p->>'failed_at', '')::timestamptz,
    nullif(p->>'failure_reason', '')
  );

  -- Een bestelling telt pas als betaald wanneer er ook echt geld tegenover
  -- staat. Alleen bij een geslaagde betaling, en alleen de eerste keer.
  if v_status = 'captured' then
    update public.pos_orders
       set paid_at = coalesce(paid_at, now())
     where id = v_order and org_id = v_org and venue_id = v_venue;
  end if;
end $$;

revoke all on function public.ingest_pos_payment(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_pos_payment(jsonb) to service_role;

comment on function public.ingest_pos_payment(jsonb) is
  'Outbox-ingest voor pos_payments. Idempotent op idempotency_key; zet paid_at op de bestelling bij een geslaagde betaling.';

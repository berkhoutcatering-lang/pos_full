-- Round 3 P1-9 — dedicated `pi_bridge` PostgREST role.
-- Pillar #1 Pi-Edge Cloud-Truth + Pillar #2 BTW-Right Audit-Ready.
--
-- The Pi currently authenticates with the SUPABASE_SERVICE_ROLE_KEY which
-- grants full DB access. If a single Pi is compromised, the attacker can
-- read every tenant's data via the Supabase data API.
--
-- This migration creates a least-privilege role limited to:
--   - EXECUTE on write_audit_log() RPC
--   - INSERT/UPDATE on pos_orders + pos_order_items + pos_payments
--     scoped to the Pi's own org_id (enforced by RLS for non-superuser
--     roles; we KEEP RLS on these tables for pi_bridge)
--   - SELECT on org_theme_settings, venues, pos_menu_items (catalog)
--
-- The Pi's env switches from SUPABASE_SERVICE_ROLE_KEY to a JWT signed
-- for the `pi_bridge` role (config: PI_BRIDGE_SUPABASE_JWT).

-- 1) Create the role with no inherited service_role privileges.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pi_bridge') then
    create role pi_bridge nologin;
  end if;
end
$$;

-- 2) Grant the bare minimum.
grant usage on schema public to pi_bridge;
grant execute on function public.write_audit_log(uuid, uuid, uuid, uuid, text, jsonb) to pi_bridge;
grant select on public.pos_menu_items, public.pos_modifier_groups, public.pos_combos, public.pos_staffels to pi_bridge;
grant select on public.org_theme_settings, public.venues, public.orgs to pi_bridge;
grant insert, update on public.pos_orders, public.pos_order_items, public.pos_payments to pi_bridge;

-- 3) RLS policies: pi_bridge can only touch its OWN org. We expose the
-- pi-bridge's org via a session-scoped GUC (`request.pi_org_id`), set by
-- Supabase's JWT-claim → request-setting mapping. The Pi's JWT must
-- contain a custom claim `pi_org_id` equal to the venue's org.
create or replace function public.pi_bridge_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'pi_org_id',
      ''
    ),
    ''
  )::uuid
$$;

-- pos_orders / pos_order_items / pos_payments: pi_bridge can only
-- insert/update rows whose org_id matches the JWT-bound pi_org_id.
create policy "pos_orders_pi_bridge_write"
  on public.pos_orders for all
  to pi_bridge
  using (org_id = public.pi_bridge_org_id())
  with check (org_id = public.pi_bridge_org_id());

create policy "pos_order_items_pi_bridge_write"
  on public.pos_order_items for all
  to pi_bridge
  using (org_id = public.pi_bridge_org_id())
  with check (org_id = public.pi_bridge_org_id());

create policy "pos_payments_pi_bridge_write"
  on public.pos_payments for all
  to pi_bridge
  using (org_id = public.pi_bridge_org_id())
  with check (org_id = public.pi_bridge_org_id());

-- 4) Explicitly deny pi_bridge access to other multi-tenant tables.
revoke all on public.memberships, public.audit_log, public.moneybird_connections, public.qr_tokens from pi_bridge;
-- audit_log writes go via write_audit_log() only; INSERT is also
-- revoked from service_role per migration 0042.

-- Operational notes (see also references/pi-setup.md):
-- - Generate a long-lived JWT signed with SUPABASE_JWT_SECRET, role
--   "pi_bridge", custom claim pi_org_id=<this Pi's org_id>.
-- - Store under /etc/pi-bridge/env as PI_BRIDGE_SUPABASE_JWT.
-- - Pi's supabaseAdmin client switches from SERVICE_ROLE_KEY to this
--   JWT (a 1-line code change in services/audit-log.ts + outbox-flush).

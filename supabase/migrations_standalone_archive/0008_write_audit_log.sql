-- Phase 2 Pi-bridge — 0008 write_audit_log RPC
-- Pi calls this with service_role. The function is the ONLY way to insert
-- into audit_log (foundation revoked direct INSERT from authenticated/anon
-- and now from service_role's default grant path is via this RPC). The
-- foundation's BEFORE INSERT trigger seals the SBA Fase 4 hash chain.

create or replace function public.write_audit_log(
  p_org_id uuid,
  p_venue_id uuid,
  p_actor_user_id uuid,
  p_actor_terminal_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_seq bigint;
begin
  -- Defensive: the foundation trigger also takes this lock, but holding it
  -- one frame earlier keeps multi-statement callers (e.g. order.placed +
  -- print.kitchen in the same flush batch) from interleaving.
  perform pg_advisory_xact_lock(hashtext('audit_log:' || p_org_id::text));

  insert into public.audit_log (
    org_id, venue_id, actor_user_id, actor_terminal_id, event_type, payload
  )
  values (
    p_org_id, p_venue_id, p_actor_user_id, p_actor_terminal_id, p_event_type, p_payload
  )
  returning seq_id into new_seq;

  return new_seq;
end
$$;

revoke execute on function public.write_audit_log(uuid, uuid, uuid, uuid, text, jsonb) from public;
revoke execute on function public.write_audit_log(uuid, uuid, uuid, uuid, text, jsonb) from authenticated, anon;
grant execute on function public.write_audit_log(uuid, uuid, uuid, uuid, text, jsonb) to service_role;

-- Round 3 P1-1 — force all audit_log writes through write_audit_log RPC
-- Pillar #2 BTW-Right Audit-Ready.
--
-- The trigger seals the hash chain, but a service_role caller can still
-- call `insert into audit_log` directly, skipping the per-org advisory
-- lock that write_audit_log acquires. Under contention, two service-role
-- writers race on hash_prev → both compute the same prev → second insert
-- gets a unique chain-state derived from stale data.
--
-- Fix: revoke INSERT from service_role at the table level; service_role
-- can only insert via the SECURITY DEFINER write_audit_log function,
-- which already holds the lock.

revoke insert on public.audit_log from service_role;

-- write_audit_log was already granted to service_role in 0008; that
-- grant survives the table revoke because the function is SECURITY
-- DEFINER and runs as its owner (postgres), not as the calling role.
--
-- Verify with: select bool_or(grantee = 'service_role' and privilege_type = 'INSERT')
-- from information_schema.table_privileges where table_name = 'audit_log';
-- → expected false.

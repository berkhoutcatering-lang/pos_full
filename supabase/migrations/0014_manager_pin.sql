-- Phase 3 Kassa — 0014 manager PIN column on memberships
-- Argon2id hash; verified server-side in manager-override Server Actions.

alter table public.memberships
  add column manager_pin_hash text
    check (manager_pin_hash is null or manager_pin_hash like '$argon2id$%');

-- Throwaway index — most memberships won't set this, only manager/owner.
create index memberships_manager_pin_idx
  on public.memberships (org_id)
  where manager_pin_hash is not null;

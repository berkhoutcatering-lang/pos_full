-- Phase 3 Kassa — 0014 manager PIN column on organization_members
-- Argon2id hash; verified server-side in manager-override Server Actions.
-- SHARED-DB NOTE: lives on the shared organization_members table now.

alter table public.organization_members
  add column if not exists manager_pin_hash text
    check (manager_pin_hash is null or manager_pin_hash like '$argon2id$%');

-- Throwaway index — most members won't set this, only manager/owner.
create index if not exists organization_members_manager_pin_idx
  on public.organization_members (organization_id)
  where manager_pin_hash is not null;

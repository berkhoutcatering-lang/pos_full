-- Round A — pos_order_state_changes table (deferred idempotency P1).
-- KDS bump-actions zoals "preparing → ready" worden upserted via Pi
-- outbox + de Server Action fallback. Beide gebruiken de same ULID
-- idempotency_key zodat dubbele bumps één rij worden.

create table public.pos_order_state_changes (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique
    check (idempotency_key ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  order_id uuid not null,
  org_id uuid not null,
  venue_id uuid not null,
  -- Composite FK match the parent's (id, org_id, venue_id) — same
  -- cross-tenant injection defence as pos_order_items + pos_payments.
  constraint pos_order_state_changes_parent_fk
    foreign key (order_id, org_id, venue_id)
    references public.pos_orders (id, org_id, venue_id)
    on delete cascade,

  from_state public.pos_order_status,
  to_state public.pos_order_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_terminal_id uuid,
  created_at timestamptz not null default now()
);

create index pos_order_state_changes_order_time_idx
  on public.pos_order_state_changes (order_id, created_at desc);
create index pos_order_state_changes_venue_time_idx
  on public.pos_order_state_changes (org_id, venue_id, created_at desc);

alter table public.pos_order_state_changes enable row level security;

create policy "pos_order_state_changes_read_members"
  on public.pos_order_state_changes for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_order_state_changes.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_order_state_changes_write_cashiers"
  on public.pos_order_state_changes for all
  using (public.is_member_with_role(org_id, 'cashier'))
  with check (public.is_member_with_role(org_id, 'cashier'));

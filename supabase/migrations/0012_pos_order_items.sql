-- Phase 3 Kassa — 0012 pos_order_items
-- Snapshot of cart lines at order time. Denormalized name/price so future
-- menu edits don't rewrite history. BTW class + rate baked in at the line.

create table public.pos_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  org_id uuid not null,
  venue_id uuid not null,
  -- Composite FK to the parent order enforces (org_id, venue_id) match the
  -- parent. Without this, a cashier in another org could plant a line item
  -- on someone else's order with their own org_id (RLS would pass because
  -- they are cashier in B; the only thing stopping it is this FK).
  constraint pos_order_items_parent_fk
    foreign key (order_id, org_id, venue_id)
    references public.pos_orders (id, org_id, venue_id)
    on delete cascade,

  position int not null check (position >= 0),

  menu_item_id uuid,
  name text not null,
  category text,

  qty int not null check (qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  modifier_total_cents int not null default 0 check (modifier_total_cents >= 0),
  discount_cents int not null default 0 check (discount_cents >= 0),

  btw_class public.btw_class not null,
  btw_rate int not null check (btw_rate in (0, 9, 21)),
  line_excl_cents int not null check (line_excl_cents >= 0),
  line_btw_cents int not null check (line_btw_cents >= 0),
  line_incl_cents int not null check (line_incl_cents >= 0),

  modifiers_json jsonb not null default '[]'::jsonb,
  notes text,

  combo_id uuid,
  is_combo_anchor boolean not null default false,

  created_at timestamptz not null default now()
);

create index pos_order_items_order_pos_idx
  on public.pos_order_items (order_id, position);
create index pos_order_items_venue_time_idx
  on public.pos_order_items (org_id, venue_id, created_at desc);

alter table public.pos_order_items enable row level security;

create policy "pos_order_items_read_members" on public.pos_order_items for select
  using (
    exists (select 1 from public.memberships m
            where m.org_id = pos_order_items.org_id
              and m.user_id = (select auth.uid()))
  );

create policy "pos_order_items_write_cashiers" on public.pos_order_items for all
  using (public.is_member_with_role(org_id, 'cashier'))
  with check (public.is_member_with_role(org_id, 'cashier'));

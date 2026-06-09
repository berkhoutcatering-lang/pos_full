-- Phase 3 Kassa — 0015 enable Realtime for KDS + CFD subscriptions
-- KDS subscribes to channel `org:{org_id}:venue:{venue_id}` filtered by
-- status in ('placed','preparing','ready'). CFD subscribes for 'ready'.

alter publication supabase_realtime add table public.pos_orders;
alter publication supabase_realtime add table public.pos_order_items;

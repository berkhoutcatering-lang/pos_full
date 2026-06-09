-- Phase 1 Foundation — 0006 ai_usage
-- Per-call Anthropic SDK usage log. Drives the tier-based cost cap (Free €0,
-- Pro €4.50, Enterprise €15 per month, soft 100% / hard 150%) enforced in
-- /admin/usage. Only /admin/chat and dagafsluiting summary write here —
-- /pos, /keuken, /cfd never call AI.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  user_id uuid,
  kind text not null check (kind in ('admin_chat','dagafsluiting_insights')),
  model_id text not null,
  prompt_version text,
  input_tokens int not null,
  output_tokens int not null,
  cache_read_tokens int not null default 0,
  cost_eur numeric(10,6) not null,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index ai_usage_org_time_idx on public.ai_usage (org_id, created_at desc);
create index ai_usage_org_kind_time_idx on public.ai_usage (org_id, kind, created_at desc);

alter table public.ai_usage enable row level security;

create policy "ai_usage_read_members"
  on public.ai_usage for select
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = ai_usage.org_id
        and m.user_id = (select auth.uid())
    )
  );

-- Inserts via service-role only (server-side after Anthropic call).

-- Per-tenant monthly rollup for the cost cap dashboard.
create or replace view public.ai_usage_monthly
with (security_invoker = true)
as
select
  org_id,
  date_trunc('month', created_at) as month,
  kind,
  sum(input_tokens) as input_tokens_sum,
  sum(output_tokens) as output_tokens_sum,
  sum(cache_read_tokens) as cache_read_tokens_sum,
  sum(cost_eur) as cost_eur_sum,
  count(*) as call_count
from public.ai_usage
group by 1, 2, 3;

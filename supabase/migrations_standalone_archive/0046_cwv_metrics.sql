-- Round B — CWV metrics ingest table (Pillar 4 Foodtruck-First).
-- Append-only, no PII. p75 + p95 aggregaten worden door /admin/usage en
-- de Checkly synthetic monitor afgelezen.

create table public.cwv_metrics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name in ('INP', 'LCP', 'CLS')),
  value_ms int not null,
  rating text check (rating in ('good', 'needs-improvement', 'poor')),
  path text,
  nav_type text,
  created_at timestamptz not null default now()
);

create index cwv_metrics_name_time_idx
  on public.cwv_metrics (name, created_at desc);
create index cwv_metrics_path_time_idx
  on public.cwv_metrics (path, created_at desc);

alter table public.cwv_metrics enable row level security;

-- Read = authenticated (managers tonen het in /admin/usage); insert via
-- service_role only (de /api/metrics/vitals route).
create policy "cwv_metrics_read_authenticated"
  on public.cwv_metrics for select
  using ((select auth.uid()) is not null);

-- TTL 30 days via pg_cron in a later migration.

-- POS Phase C: reuse BBQ's existing ai_usage table (1085 rows). Add only the
-- POS-specific columns it lacks. POS code maps: org_id->organization_id,
-- kind->action_type, model_id->model, input_tokens->tokens_input,
-- output_tokens->tokens_output, cache_read_tokens->tokens_cache_read,
-- cost_eur->cost_eur_cents (x100). venue_id/prompt_version/latency_ms are new.
alter table public.ai_usage
  add column if not exists venue_id uuid references public.venues(id) on delete set null,
  add column if not exists prompt_version text,
  add column if not exists latency_ms int;

create index if not exists ai_usage_org_venue_time_idx
  on public.ai_usage (organization_id, venue_id, created_at desc);

import "server-only"
import { createClient } from "@supabase/supabase-js"

// Tier-based monthly Anthropic spend caps. Soft cap at 100% = banner +
// non-blocking; hard cap at 150% = block new calls except for owners
// (admin override, audited).
export const TIER_CAPS_EUR: Record<string, number> = {
  free: 0,
  pro: 4.5,
  enterprise: 15,
}

// Haiku 4.5 pricing per 1M tokens (EUR; verify against Anthropic billing).
const HAIKU_INPUT_PER_1M = 0.8
const HAIKU_OUTPUT_PER_1M = 4.0
const HAIKU_CACHE_READ_PER_1M = 0.08

// Sonnet 4.6 pricing per 1M tokens (used for monthly summary only).
const SONNET_INPUT_PER_1M = 3.0
const SONNET_OUTPUT_PER_1M = 15.0
const SONNET_CACHE_READ_PER_1M = 0.3

export type ModelKey = "haiku-4-5" | "sonnet-4-6"

export function computeCostEur(args: {
  model: ModelKey
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
}): number {
  const rates =
    args.model === "haiku-4-5"
      ? [HAIKU_INPUT_PER_1M, HAIKU_OUTPUT_PER_1M, HAIKU_CACHE_READ_PER_1M]
      : [SONNET_INPUT_PER_1M, SONNET_OUTPUT_PER_1M, SONNET_CACHE_READ_PER_1M]
  return (
    (args.input_tokens * rates[0]! +
      args.output_tokens * rates[1]! +
      args.cache_read_tokens * rates[2]!) /
    1_000_000
  )
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export interface CapStatus {
  used_eur: number
  cap_eur: number
  pct: number
  soft_cap_reached: boolean
  hard_cap_reached: boolean
  tier: string
}

export async function checkCostCap(orgId: string): Promise<CapStatus> {
  const supabase = admin()
  const { data: org } = await supabase
    .from("organizations")
    .select("pos_tier")
    .eq("id", orgId)
    .maybeSingle()
  const tier = (org?.pos_tier as string) ?? "free"
  const cap_eur = TIER_CAPS_EUR[tier] ?? 0

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  // Shared ai_usage stores cost in integer cents (cost_eur_cents).
  const { data } = await supabase
    .from("ai_usage")
    .select("cost_eur_cents")
    .eq("organization_id", orgId)
    .gte("created_at", monthStart.toISOString())
  const used_eur = (data ?? []).reduce(
    (s, row) => s + Number(row.cost_eur_cents ?? 0) / 100,
    0,
  )
  const pct = cap_eur > 0 ? used_eur / cap_eur : Number.POSITIVE_INFINITY
  return {
    used_eur,
    cap_eur,
    pct,
    soft_cap_reached: pct >= 1,
    hard_cap_reached: pct >= 1.5,
    tier,
  }
}

export async function recordUsage(args: {
  org_id: string
  venue_id: string | null
  user_id: string | null
  kind: "admin_chat" | "dagafsluiting_insights"
  model_id: string
  prompt_version?: string | null
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cost_eur: number
  latency_ms?: number | null
}) {
  const supabase = admin()
  // Map POS semantics -> shared ai_usage column names.
  await supabase.from("ai_usage").insert({
    organization_id: args.org_id,
    venue_id: args.venue_id,
    user_id: args.user_id,
    action_type: args.kind,
    model: args.model_id,
    prompt_version: args.prompt_version ?? null,
    tokens_input: args.input_tokens,
    tokens_output: args.output_tokens,
    tokens_cache_read: args.cache_read_tokens,
    cost_eur_cents: Math.round(args.cost_eur * 100),
    latency_ms: args.latency_ms ?? null,
  })
}

// Pre-debit pattern (Phase 6 deferred P1). Writes a "pending" row
// BEFORE the Anthropic call so the cost cap can't be bypassed if the
// post-call insert fails. Finalised after the call with the real
// token-count + cost.
export async function preDebitUsage(args: {
  org_id: string
  venue_id: string | null
  user_id: string | null
  kind: "admin_chat" | "dagafsluiting_insights"
  model_id: string
  prompt_version?: string | null
  estimated_cost_eur: number
}): Promise<{ usage_id: string }> {
  const supabase = admin()
  const { data, error } = await supabase
    .from("ai_usage")
    .insert({
      organization_id: args.org_id,
      venue_id: args.venue_id,
      user_id: args.user_id,
      action_type: args.kind,
      model: args.model_id,
      prompt_version: args.prompt_version ?? null,
      tokens_input: 0,
      tokens_output: 0,
      tokens_cache_read: 0,
      cost_eur_cents: Math.round(args.estimated_cost_eur * 100),
      latency_ms: null,
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`preDebitUsage failed: ${error?.message}`)
  return { usage_id: String(data.id) }
}

export async function finaliseUsage(args: {
  usage_id: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cost_eur: number
  latency_ms: number
}) {
  const supabase = admin()
  await supabase
    .from("ai_usage")
    .update({
      tokens_input: args.input_tokens,
      tokens_output: args.output_tokens,
      tokens_cache_read: args.cache_read_tokens,
      cost_eur_cents: Math.round(args.cost_eur * 100),
      latency_ms: args.latency_ms,
    })
    .eq("id", args.usage_id)
}

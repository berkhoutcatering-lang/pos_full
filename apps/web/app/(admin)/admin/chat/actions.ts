"use server"
import Anthropic from "@anthropic-ai/sdk"
import { createClient as createSbAdmin } from "@supabase/supabase-js"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import {
  ADMIN_CHAT_PROMPT_VERSION,
  ADMIN_CHAT_TOOLS,
  buildAdminChatSystem,
} from "@/lib/ai/admin-chat-prompt"
import {
  checkCostCap,
  computeCostEur,
  finaliseUsage,
  preDebitUsage,
} from "@/lib/ai/cost-cap"
import { TOOL_REGISTRY, type ToolName } from "@/lib/dal/admin-tools"

const MODEL_ID = "claude-haiku-4-5-20251001"
const MAX_TOOL_ITERATIONS = 6

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

type Result =
  | { ok: true; text: string; usage: { input: number; output: number; cost_eur: number } }
  | { ok: false; error: string; message?: string }

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function adminChatAction(messages: ChatMessage[]): Promise<Result> {
  await requireRole("manager")
  const claims = await requireVenue()

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "not_configured" }
  }

  const cap = await checkCostCap(claims.orgId)
  if (cap.hard_cap_reached) {
    return {
      ok: false,
      error: "cost_cap_reached",
      message: `AI-budget is op voor deze maand (€${cap.used_eur.toFixed(2)} van €${(cap.cap_eur * 1.5).toFixed(2)} hard cap). Eigenaar moet upgraden of wachten op de volgende maand.`,
    }
  }

  let running: Anthropic.Messages.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let totalInput = 0
  let totalOutput = 0
  let totalCacheRead = 0
  const t0 = Date.now()

  // Pillar 5: per-tenant system prompt. Pull org + venue metadata once;
  // the result text is the cache key, so all calls within this session
  // hit the same ephemeral cache (5min TTL).
  const sbAdmin = createSbAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const [{ data: org }, { data: venue }] = await Promise.all([
    sbAdmin
      .from("orgs")
      .select("name, kvk_number, btw_number")
      .eq("id", claims.orgId)
      .maybeSingle(),
    sbAdmin
      .from("venues")
      .select("name")
      .eq("id", claims.venueId)
      .maybeSingle(),
  ])
  const systemPrompt = buildAdminChatSystem({
    tenant_name: (org?.name as string) ?? "POS",
    kvk_number: (org?.kvk_number as string | null) ?? null,
    btw_number: (org?.btw_number as string | null) ?? null,
    venue_name: (venue?.name as string) ?? "Onbekende venue",
  })

  // Pre-debit pattern — write a pending usage row BEFORE the API call.
  // The estimated cost is a conservative upper-bound (assume max_tokens
  // output, no cache hit). If the call fails the row stays at this
  // estimate; if it succeeds finaliseUsage rewrites with the real cost.
  const ESTIMATED_MAX_COST = computeCostEur({
    model: "haiku-4-5",
    input_tokens: 2000,
    output_tokens: 1024,
    cache_read_tokens: 0,
  })
  const debit = await preDebitUsage({
    org_id: claims.orgId,
    venue_id: claims.venueId,
    user_id: claims.userId,
    kind: "admin_chat",
    model_id: MODEL_ID,
    prompt_version: ADMIN_CHAT_PROMPT_VERSION,
    estimated_cost_eur: ESTIMATED_MAX_COST,
  })

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const res = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: ADMIN_CHAT_TOOLS,
      messages: running,
    })

    totalInput += res.usage.input_tokens
    totalOutput += res.usage.output_tokens
    totalCacheRead +=
      (res.usage as { cache_read_input_tokens?: number })
        .cache_read_input_tokens ?? 0

    const toolUses = res.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    )

    if (toolUses.length === 0) {
      const text = res.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
      const cost_eur = computeCostEur({
        model: "haiku-4-5",
        input_tokens: totalInput,
        output_tokens: totalOutput,
        cache_read_tokens: totalCacheRead,
      })
      await finaliseUsage({
        usage_id: debit.usage_id,
        input_tokens: totalInput,
        output_tokens: totalOutput,
        cache_read_tokens: totalCacheRead,
        cost_eur,
        latency_ms: Date.now() - t0,
      })
      return {
        ok: true,
        text,
        usage: { input: totalInput, output: totalOutput, cost_eur },
      }
    }

    // Execute each tool the model called.
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const name = tu.name as ToolName
      const fn = TOOL_REGISTRY[name]
      if (!fn) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `tool ${tu.name} niet gevonden`,
          is_error: true,
        })
        continue
      }
      try {
        const result = await fn(tu.input as never, {
          orgId: claims.orgId,
          venueId: claims.venueId,
          userId: claims.userId,
        })
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        })
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: (err as Error).message,
          is_error: true,
        })
      }
    }

    running = [
      ...running,
      { role: "assistant", content: res.content },
      { role: "user", content: toolResults },
    ]
  }

  return { ok: false, error: "tool_loop_exceeded" }
}

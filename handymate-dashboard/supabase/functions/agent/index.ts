// Handymate AI Agent — Main Orchestrator
// Supabase Edge Function with Claude tool-use loop

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.24.0"

import { toolDefinitions } from "./tool-definitions.ts"
import { buildSystemPrompt } from "./system-prompt.ts"
import {
  getCustomer,
  searchCustomers,
  createCustomer,
  updateCustomer,
} from "./tools/crm.ts"
import {
  createQuote,
  getQuotes,
  createInvoice,
  checkCalendar,
  createBooking,
  updateProject,
  logTime,
} from "./tools/operations.ts"
import { sendSms, sendEmail } from "./tools/communications.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const MAX_STEPS = 10
const MODEL = "claude-sonnet-4-20250514"

// ── Types ────────────────────────────────────────────────

interface AgentRequest {
  trigger_type: "phone_call" | "incoming_sms" | "cron" | "manual"
  business_id: string
  trigger_data?: Record<string, unknown>
}

interface AgentStep {
  step: number
  role: string
  content?: string
  tool_calls?: Array<{
    tool: string
    input: unknown
    result: unknown
  }>
}

// ── Tool Router ──────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  context: { businessName: string; contactEmail: string }
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  switch (name) {
    // CRM
    case "get_customer":
      return getCustomer(supabase, businessId, input as any)
    case "search_customers":
      return searchCustomers(supabase, businessId, input as any)
    case "create_customer":
      return createCustomer(supabase, businessId, input as any)
    case "update_customer":
      return updateCustomer(supabase, businessId, input as any)

    // Operations
    case "create_quote":
      return createQuote(supabase, businessId, input as any)
    case "get_quotes":
      return getQuotes(supabase, businessId, input as any)
    case "create_invoice":
      return createInvoice(supabase, businessId, input as any)
    case "check_calendar":
      return checkCalendar(supabase, businessId, input as any)
    case "create_booking":
      return createBooking(supabase, businessId, input as any)
    case "update_project":
      return updateProject(supabase, businessId, input as any)
    case "log_time":
      return logTime(supabase, businessId, input as any)

    // Communications
    case "send_sms":
      return sendSms(supabase, businessId, input as any, context)
    case "send_email":
      return sendEmail(supabase, businessId, input as any, context)

    default:
      return { success: false, error: `Okänt verktyg: ${name}` }
  }
}

// ── Main Agent Loop ──────────────────────────────────────

async function runAgent(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  request: AgentRequest
): Promise<{
  steps: AgentStep[]
  final_response: string
  total_tokens: number
  tool_call_count: number
}> {
  // Fetch business config
  const { data: business, error: bizErr } = await supabase
    .from("business_config")
    .select(
      "business_id, business_name, contact_name, contact_email, branch, service_area, phone_number, assigned_phone_number, pricing_settings, knowledge_base, working_hours"
    )
    .eq("business_id", request.business_id)
    .single()

  if (bizErr || !business) {
    throw new Error(`Företag ${request.business_id} hittades inte: ${bizErr?.message}`)
  }

  const systemPrompt = buildSystemPrompt(
    business,
    request.trigger_type,
    request.trigger_data
  )

  const context = {
    businessName: business.business_name || "Handymate",
    contactEmail: business.contact_email || "",
  }

  // Conversation messages
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildUserMessage(request),
    },
  ]

  const steps: AgentStep[] = []
  let totalTokens = 0
  let toolCallCount = 0
  let finalResponse = ""

  for (let step = 0; step < MAX_STEPS; step++) {
    console.log(`[AgentStep ${step + 1}] Calling Claude...`)

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolDefinitions as any,
      messages,
    })

    totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)

    // Extract text and tool use from response
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    )
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )

    const stepLog: AgentStep = {
      step: step + 1,
      role: "assistant",
      content: textBlocks.map((b) => b.text).join("\n"),
      tool_calls: [],
    }

    // If the model wants to stop
    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
      finalResponse = textBlocks.map((b) => b.text).join("\n")
      stepLog.content = finalResponse
      steps.push(stepLog)
      console.log(`[AgentStep ${step + 1}] Done — end_turn`)
      break
    }

    // Execute tool calls
    console.log(
      `[AgentStep ${step + 1}] ${toolUseBlocks.length} tool call(s): ${toolUseBlocks.map((b) => b.name).join(", ")}`
    )

    // Push the assistant message with tool_use blocks
    messages.push({
      role: "assistant",
      content: response.content,
    })

    // Execute each tool and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUseBlocks) {
      toolCallCount++
      console.log(
        `[AgentStep ${step + 1}] Executing ${toolUse.name}(${JSON.stringify(toolUse.input).substring(0, 200)})`
      )

      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        supabase,
        request.business_id,
        context
      )

      stepLog.tool_calls!.push({
        tool: toolUse.name,
        input: toolUse.input,
        result,
      })

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      })
    }

    // Push tool results as user message
    messages.push({
      role: "user",
      content: toolResults,
    })

    steps.push(stepLog)
  }

  // If we hit max steps without end_turn
  if (!finalResponse) {
    finalResponse =
      "Agenten nådde maximalt antal steg utan att avsluta. Senaste åtgärderna har loggats."
  }

  return { steps, final_response: finalResponse, total_tokens: totalTokens, tool_call_count: toolCallCount }
}

// ── Helpers ──────────────────────────────────────────────

function buildUserMessage(request: AgentRequest): string {
  switch (request.trigger_type) {
    case "phone_call":
      return `Ett samtal har just avslutats. Analysera transkriptionen och vidta lämpliga åtgärder (skapa kund, boka, skicka SMS-bekräftelse, etc.).`

    case "incoming_sms":
      return `Du har fått ett inkommande SMS. Läs meddelandet, identifiera kunden, och svara eller vidta åtgärder efter behov.`

    case "cron":
      return `Det är dags för den dagliga genomgången. Kontrollera uppföljningar, förfallna offerter, och morgondagens bokningar.`

    case "manual":
      return (
        (request.trigger_data?.instruction as string) ||
        "Utför den begärda uppgiften."
      )

    default:
      return `Hantera denna trigger: ${request.trigger_type}`
  }
}

// ── Edge Function Handler ────────────────────────────────

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const anthropic = new Anthropic({ apiKey: anthropicKey })

  try {
    const body: AgentRequest = await req.json()

    if (!body.trigger_type || !body.business_id) {
      return new Response(
        JSON.stringify({ error: "Missing trigger_type or business_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    console.log(
      `[Agent] Starting: trigger=${body.trigger_type}, business=${body.business_id}`
    )

    const startTime = Date.now()
    const result = await runAgent(supabase, anthropic, body)
    const durationMs = Date.now() - startTime

    // Estimate cost (Sonnet 4: ~$3/M input, ~$15/M output — rough estimate)
    const estimatedCost = +(result.total_tokens * 0.000009).toFixed(4)

    // Log the run to agent_runs table
    const runId = "run_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    await supabase
      .from("agent_runs")
      .insert({
        run_id: runId,
        business_id: body.business_id,
        trigger_type: body.trigger_type,
        trigger_data: body.trigger_data || {},
        steps: result.steps,
        tool_calls: result.tool_call_count,
        final_response: result.final_response,
        tokens_used: result.total_tokens,
        estimated_cost: estimatedCost,
        duration_ms: durationMs,
        status: "completed",
        created_at: new Date().toISOString(),
      })
      .catch((err: Error) => {
        console.error("[Agent] Failed to log run:", err.message)
      })

    console.log(
      `[Agent] Completed in ${durationMs}ms — ${result.steps.length} steps, ${result.tool_call_count} tool calls, ${result.total_tokens} tokens`
    )

    return new Response(
      JSON.stringify({
        run_id: runId,
        trigger_type: body.trigger_type,
        steps: result.steps.length,
        tool_calls: result.tool_call_count,
        tokens_used: result.total_tokens,
        estimated_cost: estimatedCost,
        duration_ms: durationMs,
        final_response: result.final_response,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  } catch (err) {
    console.error("[Agent] Error:", err)
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal agent error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})

/**
 * V6 Shared Agent Loop — återanvändbar agentic loop för alla subagenter.
 *
 * Extraherad från app/api/agent/trigger/route.ts.
 * Stödjer eskalering via `escalate_to_strategist` tool.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { executeTool } from '@/app/api/agent/trigger/tool-router'
import { toolDefinitions } from '@/app/api/agent/trigger/tool-definitions'
import { ensureValidToken } from '@/lib/google-calendar'
import { getBusinessPreferences } from '@/lib/business-preferences'

// ── Types ──

export interface StepLog {
  step: number
  content?: string
  tool_calls?: Array<{ tool: string; input: unknown; result: unknown }>
}

export interface AgentConfig {
  model: string
  systemPrompt: string
  tools: typeof toolDefinitions
  maxSteps: number
  userMessage: string
}

export interface AgentRunResult {
  finalResponse: string
  steps: StepLog[]
  toolCallCount: number
  tokensUsed: number
  durationMs: number
  escalation?: {
    reason: string
    findings: string
    recommendedAction?: string
  }
}

export interface ToolContext {
  businessName: string
  contactEmail: string
  googleConnection: GoogleConnection | null
}

export interface GoogleConnection {
  access_token: string
  refresh_token: string
  token_expires_at: string | null
  calendar_id: string
  account_email: string
  gmail_scope_granted: boolean
  gmail_send_scope_granted: boolean
  gmail_sync_enabled: boolean
  sync_enabled: boolean
}

export interface BusinessContext {
  bizConfig: any
  googleConnection: GoogleConnection | null
  preferences: Record<string, string>
  v3Settings: any
  agentContext: any
  learnedPreferences: any
  toolContext: ToolContext
}

// ── Escalation tool definition ──

export const escalateToolDefinition = {
  name: 'escalate_to_strategist',
  description: 'Eskalera till strategi-agenten om: (1) jobbet uppskattas >50 000 kr, (2) kunden har dålig betalningshistorik, (3) situationen kräver komplex förhandling, (4) du är osäker på bästa åtgärden.',
  input_schema: {
    type: 'object' as const,
    properties: {
      reason: { type: 'string', description: 'Varför du eskalerar' },
      findings: { type: 'string', description: 'Vad du hittills kommit fram till' },
      recommended_action: { type: 'string', description: 'Ditt förslag, om du har ett' },
    },
    required: ['reason', 'findings'],
  },
} as const

// ── Tool filtering ──

export function filterTools(
  allowedNames: string[]
): typeof toolDefinitions {
  return toolDefinitions.filter(t => allowedNames.includes(t.name)) as unknown as typeof toolDefinitions
}

// ── Business context fetcher ──

export async function fetchBusinessContext(
  supabase: SupabaseClient,
  businessId: string
): Promise<BusinessContext | null> {
  // Fetch business config
  const { data: bizConfig } = await supabase
    .from('business_config')
    .select(
      'business_id, user_id, business_name, contact_name, contact_email, branch, service_area, phone_number, assigned_phone_number, personal_phone, pricing_settings, knowledge_base, working_hours'
    )
    .eq('business_id', businessId)
    .single()

  if (!bizConfig) return null

  // Fetch Google connection
  let googleConnection: GoogleConnection | null = null

  const { data: businessUser } = await supabase
    .from('business_users')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', bizConfig.user_id)
    .eq('is_active', true)
    .single()

  if (businessUser) {
    const { data: conn } = await supabase
      .from('calendar_connection')
      .select('id, access_token, refresh_token, token_expires_at, calendar_id, account_email, gmail_scope_granted, gmail_send_scope_granted, gmail_sync_enabled, sync_enabled')
      .eq('business_user_id', businessUser.id)
      .eq('provider', 'google')
      .single()

    if (conn) {
      try {
        const tokenResult = await ensureValidToken(conn as any)
        if (tokenResult) {
          if (tokenResult.access_token !== conn.access_token) {
            await supabase
              .from('calendar_connection')
              .update({
                access_token: tokenResult.access_token,
                token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
              })
              .eq('id', conn.id)
          }
          googleConnection = {
            ...conn,
            access_token: tokenResult.access_token,
            gmail_scope_granted: conn.gmail_scope_granted ?? false,
            gmail_send_scope_granted: conn.gmail_send_scope_granted ?? false,
            gmail_sync_enabled: conn.gmail_sync_enabled ?? false,
            sync_enabled: conn.sync_enabled ?? false,
          }
        }
      } catch { /* non-blocking */ }
    }
  }

  // Fallback: calendar_connection via business_id
  if (!googleConnection) {
    const { data: conn } = await supabase
      .from('calendar_connection')
      .select('id, access_token, refresh_token, token_expires_at, calendar_id, account_email, gmail_scope_granted, gmail_send_scope_granted, gmail_sync_enabled, sync_enabled')
      .eq('business_id', businessId)
      .eq('provider', 'google')
      .maybeSingle()

    if (conn) {
      try {
        const tokenResult = await ensureValidToken(conn as any)
        if (tokenResult) {
          if (tokenResult.access_token !== conn.access_token) {
            await supabase
              .from('calendar_connection')
              .update({
                access_token: tokenResult.access_token,
                token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
              })
              .eq('id', conn.id)
          }
          googleConnection = {
            ...conn,
            access_token: tokenResult.access_token,
            gmail_scope_granted: conn.gmail_scope_granted ?? false,
            gmail_send_scope_granted: conn.gmail_send_scope_granted ?? false,
            gmail_sync_enabled: conn.gmail_sync_enabled ?? false,
            sync_enabled: conn.sync_enabled ?? false,
          }
        }
      } catch { /* non-blocking */ }
    }
  }

  // Fetch preferences
  const preferences = await getBusinessPreferences(businessId)

  // Fetch V3 automation settings
  const { data: v3Settings } = await supabase
    .from('v3_automation_settings')
    .select('work_start, work_end, work_days, night_mode_enabled, min_job_value_sek, require_approval_send_quote, require_approval_send_invoice, require_approval_create_booking, lead_response_target_minutes, call_handling_mode')
    .eq('business_id', businessId)
    .maybeSingle()

  // Fetch agent_context
  let agentContext: any = null
  try {
    const { data: ctx } = await supabase
      .from('agent_context')
      .select('generated_at, business_health, open_leads_count, overdue_invoices_count, pending_approvals_count, key_insights, recommended_priorities')
      .eq('business_id', businessId)
      .maybeSingle()
    agentContext = ctx
  } catch { /* non-blocking */ }

  // Fetch learned preferences
  let learnedPreferences: any = null
  try {
    const { data: prefs } = await supabase
      .from('business_preferences')
      .select('communication_tone, pricing_tendency, lead_response_style, preferred_sms_length, custom_preferences')
      .eq('business_id', businessId)
      .maybeSingle()
    learnedPreferences = prefs
  } catch { /* non-blocking */ }

  return {
    bizConfig,
    googleConnection,
    preferences,
    v3Settings,
    agentContext,
    learnedPreferences,
    toolContext: {
      businessName: bizConfig.business_name || 'Handymate',
      contactEmail: bizConfig.contact_email || '',
      googleConnection,
    },
  }
}

// ── Agentic loop ──

export async function runAgentLoop(
  config: AgentConfig,
  supabase: SupabaseClient,
  businessId: string,
  toolContext: ToolContext
): Promise<AgentRunResult> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  const messages: any[] = [
    { role: 'user', content: config.userMessage },
  ]

  const steps: StepLog[] = []
  let totalTokens = 0
  let toolCallCount = 0
  let finalResponse = ''
  let escalation: AgentRunResult['escalation'] = undefined

  const startTime = Date.now()

  for (let step = 0; step < config.maxSteps; step++) {
    const response: any = await (anthropic.messages as any).create({
      model: config.model,
      max_tokens: 4096,
      system: config.systemPrompt,
      tools: config.tools as any,
      messages,
    })

    totalTokens +=
      (response.usage?.input_tokens || 0) +
      (response.usage?.output_tokens || 0)

    const textBlocks = (response.content || []).filter(
      (b: any) => b.type === 'text'
    )
    const toolUseBlocks = (response.content || []).filter(
      (b: any) => b.type === 'tool_use'
    )

    const stepLog: StepLog = {
      step: step + 1,
      content: textBlocks.map((b: any) => b.text).join('\n'),
      tool_calls: [],
    }

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      finalResponse = textBlocks.map((b: any) => b.text).join('\n')
      stepLog.content = finalResponse
      steps.push(stepLog)
      break
    }

    // Check for escalation tool
    const escalateCall = toolUseBlocks.find(
      (b: any) => b.name === 'escalate_to_strategist'
    )
    if (escalateCall) {
      const input = escalateCall.input as Record<string, unknown>
      escalation = {
        reason: (input.reason as string) || '',
        findings: (input.findings as string) || '',
        recommendedAction: (input.recommended_action as string) || undefined,
      }
      finalResponse = textBlocks.map((b: any) => b.text).join('\n')
      stepLog.content = finalResponse
      stepLog.tool_calls!.push({
        tool: 'escalate_to_strategist',
        input: escalateCall.input,
        result: { escalated: true },
      })
      steps.push(stepLog)
      break
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolResults: any[] = []

    for (const toolUse of toolUseBlocks) {
      toolCallCount++
      const result = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        supabase,
        businessId,
        toolContext
      )

      stepLog.tool_calls!.push({
        tool: toolUse.name,
        input: toolUse.input,
        result,
      })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      })
    }

    messages.push({ role: 'user', content: toolResults })
    steps.push(stepLog)
  }

  if (!finalResponse && !escalation) {
    finalResponse = 'Agenten nådde maximalt antal steg.'
  }

  return {
    finalResponse,
    steps,
    toolCallCount,
    tokensUsed: totalTokens,
    durationMs: Date.now() - startTime,
    escalation,
  }
}

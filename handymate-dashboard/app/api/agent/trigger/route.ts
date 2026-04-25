import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, isBillingActive } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken } from '@/lib/google-calendar'
import Anthropic from '@anthropic-ai/sdk'

import { toolDefinitions } from './tool-definitions'
import { buildSystemPrompt } from './system-prompt'
import { executeTool } from './tool-router'
import { getBusinessPreferences } from '@/lib/business-preferences'
import { routeToAgent, getAgentPromptSuffix, getAgentTools } from '@/lib/agents/personalities'
import { getRelevantMemories, buildMemoryPrompt, getAgentMessages as fetchAgentMessages, buildMessagesPrompt, extractAndSaveMemory } from '@/lib/agents/memory'

// Central AI agent endpoint — handles ALL inbound triggers:
// - Manual (dashboard), phone_call (46elks/Vapi), incoming_sms, cron
// Supports both user-session auth and internal server-to-server auth.

// Allow up to 60s for multi-step agent runs (Vercel Pro)
export const maxDuration = 60

const MAX_STEPS = 10
const MODEL = 'claude-sonnet-4-6'

export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const body = await request.json()
    const { trigger_type, trigger_data, idempotency_key } = body

    // ── Auth: support both user-session and internal server-to-server ──
    const internalSecret = request.headers.get('x-internal-secret')
    let businessId: string

    if (internalSecret && internalSecret === process.env.CRON_SECRET) {
      // Internal call from webhooks/crons — use business_id from body
      if (!body.business_id) {
        return NextResponse.json({ error: 'Missing business_id for internal call' }, { status: 400 })
      }
      businessId = body.business_id
    } else {
      // External call from dashboard — use cookie auth
      const business = await getAuthenticatedBusiness(request)
      if (!business) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      businessId = business.business_id
    }

    if (!trigger_type) {
      return NextResponse.json(
        { error: 'Missing trigger_type' },
        { status: 400 }
      )
    }

    // ── Idempotency check — prevent duplicate runs ──
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('agent_runs')
        .select('run_id, status, final_response, tool_calls, duration_ms')
        .eq('idempotency_key', idempotency_key)
        .single()

      if (existing) {
        return NextResponse.json({
          run_id: existing.run_id,
          duplicate: true,
          status: existing.status,
          final_response: existing.final_response,
          tool_calls: existing.tool_calls,
          duration_ms: existing.duration_ms,
        })
      }
    }
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })

    // Fetch full business config for the system prompt
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select(
        'business_id, user_id, business_name, contact_name, contact_email, branch, service_area, phone_number, assigned_phone_number, personal_phone, pricing_settings, knowledge_base, working_hours, subscription_status, trial_ends_at'
      )
      .eq('business_id', businessId)
      .single()

    if (!bizConfig) {
      return NextResponse.json(
        { error: 'Business config not found' },
        { status: 404 }
      )
    }

    // Blockera agent-körning om trial gått ut eller past_due
    // (gäller alla triggers: manual, cron, phone_call, incoming_sms)
    const billingCheck = isBillingActive(bizConfig)
    if (!billingCheck.allowed) {
      return NextResponse.json({
        error: billingCheck.message || 'Prenumerationen är inte aktiv',
        billing_inactive: true,
      }, { status: 402 })
    }

    // Fetch Google Calendar/Gmail connection for this business
    let googleConnection: {
      access_token: string
      refresh_token: string
      token_expires_at: string | null
      calendar_id: string
      account_email: string
      gmail_scope_granted: boolean
      gmail_send_scope_granted: boolean
      gmail_sync_enabled: boolean
      sync_enabled: boolean
    } | null = null

    // Try to find calendar_connection via business_users first, then fallback to business_id
    let calendarConnectionId: string | null = null

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
        calendarConnectionId = conn.id
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
        } catch (err) {
          console.error('[AgentTrigger] Google token refresh failed:', err)
        }
      }
    }

    // Fallback: if no business_users row found, try calendar_connection via business_id directly
    if (!googleConnection) {
      const { data: conn } = await supabase
        .from('calendar_connection')
        .select('id, access_token, refresh_token, token_expires_at, calendar_id, account_email, gmail_scope_granted, gmail_send_scope_granted, gmail_sync_enabled, sync_enabled')
        .eq('business_id', businessId)
        .eq('provider', 'google')
        .maybeSingle()

      if (conn) {
        calendarConnectionId = conn.id
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
        } catch (err) {
          console.error('[AgentTrigger] Google token refresh (fallback) failed:', err)
        }
      }
    }

    // Fetch learned preferences
    const preferences = await getBusinessPreferences(businessId)

    // Fetch V3 automation settings
    const { data: v3Settings } = await supabase
      .from('v3_automation_settings')
      .select('work_start, work_end, work_days, night_mode_enabled, min_job_value_sek, require_approval_send_quote, require_approval_send_invoice, require_approval_create_booking, lead_response_target_minutes, call_handling_mode')
      .eq('business_id', businessId)
      .maybeSingle()

    // V4: Look up pipeline context if a lead_id is in trigger_data
    let leadPipelineContext: { lead_id: string; pipeline_stage_key: string; pipeline_stage_label: string } | null = null
    if (trigger_data?.lead_id) {
      try {
        const { data: lead } = await supabase
          .from('leads')
          .select('lead_id, pipeline_stage_key')
          .eq('lead_id', trigger_data.lead_id as string)
          .eq('business_id', businessId)
          .maybeSingle()
        if (lead?.pipeline_stage_key) {
          const { data: stage } = await supabase
            .from('pipeline_stages')
            .select('label')
            .eq('business_id', businessId)
            .eq('key', lead.pipeline_stage_key)
            .maybeSingle()
          leadPipelineContext = {
            lead_id: lead.lead_id,
            pipeline_stage_key: lead.pipeline_stage_key,
            pipeline_stage_label: stage?.label || lead.pipeline_stage_key,
          }
        }
      } catch { /* non-blocking */ }
    }

    // V5: Fetch agent_context (nattlig analys)
    let agentContext: any = null
    try {
      const { data: ctx } = await supabase
        .from('agent_context')
        .select('generated_at, business_health, open_leads_count, overdue_invoices_count, pending_approvals_count, key_insights, recommended_priorities')
        .eq('business_id', businessId)
        .maybeSingle()
      agentContext = ctx
    } catch { /* non-blocking — tabellen kanske inte finns ännu */ }

    // V5: Fetch learned preferences
    let learnedPreferences: any = null
    try {
      const { data: prefs } = await supabase
        .from('business_preferences')
        .select('communication_tone, pricing_tendency, lead_response_style, preferred_sms_length, custom_preferences')
        .eq('business_id', businessId)
        .maybeSingle()
      learnedPreferences = prefs
    } catch { /* non-blocking */ }

    // Route to specialist agent
    const agentId = body.agent_id || routeToAgent(trigger_type, trigger_data?.cron_type || trigger_data?.event_name)

    const baseSystemPrompt = buildSystemPrompt(
      {
        ...bizConfig,
        google_calendar_connected: !!googleConnection?.sync_enabled,
        google_calendar_email: googleConnection?.account_email || undefined,
        gmail_connected: !!googleConnection?.gmail_scope_granted && !!googleConnection?.gmail_sync_enabled,
        gmail_send_enabled: !!googleConnection?.gmail_send_scope_granted && !!googleConnection?.gmail_sync_enabled,
        preferences,
        automationSettings: v3Settings || null,
        call_handling_mode: v3Settings?.call_handling_mode || 'agent_with_transfer',
        agentContext,
        learnedPreferences,
        leadPipelineContext,
      },
      trigger_type,
      trigger_data
    )

    // Inject agent personality + memories + messages
    let memorySuffix = ''
    let messagesSuffix = ''
    try {
      const [memories, agentMsgs] = await Promise.all([
        getRelevantMemories(businessId, agentId),
        fetchAgentMessages(businessId, agentId),
      ])
      memorySuffix = buildMemoryPrompt(memories)
      messagesSuffix = buildMessagesPrompt(agentMsgs)
    } catch { /* non-blocking */ }

    const systemPrompt = baseSystemPrompt + '\n\n' + getAgentPromptSuffix(agentId) + memorySuffix + messagesSuffix

    const context = {
      businessName: bizConfig.business_name || 'Handymate',
      contactEmail: bizConfig.contact_email || '',
      googleConnection,
      agentId,
    }

    // Build initial user message
    const userMessage = trigger_type === 'manual'
      ? (trigger_data?.instruction || 'Utför den begärda uppgiften.')
      : `Hantera denna ${trigger_type}-trigger.`

    // Use any[] for messages to avoid SDK version type conflicts
    // Om konversation finns (chat-läge) → använd hela historiken som kontext
    const conversation = Array.isArray(trigger_data?.conversation) ? trigger_data.conversation : null
    const messages: any[] = conversation && conversation.length > 0
      ? conversation
          .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m: any) => ({ role: m.role, content: m.content }))
      : [{ role: 'user', content: userMessage as string }]

    const steps: Array<{
      step: number
      content?: string
      tool_calls?: Array<{ tool: string; input: unknown; result: unknown }>
    }> = []
    const agentAllowedTools = getAgentTools(agentId)
    let totalTokens = 0
    let toolCallCount = 0
    let finalResponse = ''

    const startTime = Date.now()

    // Cache-aware system-prompt: array-format med ephemeral cache_control
    // ger ~90% rabatt på cache-hits och stora besparingar i tool-loopen.
    const systemPromptCached: any = [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ]

    // Antal messages innan loopen börjar — initial user-meddelande(n).
    // Används för att trimma tool-historiken utan att tappa initial context.
    const initialMessageCount = messages.length

    for (let step = 0; step < MAX_STEPS; step++) {
      // Trimma message-historiken: behåll initial + senaste 4 (2 par tool_use+tool_result)
      // Reducerar token-volym på iterationer 3+ utan att förlora aktuell context.
      const toolMessages = messages.slice(initialMessageCount)
      const messagesToSend = toolMessages.length <= 4
        ? messages
        : [...messages.slice(0, initialMessageCount), ...toolMessages.slice(-4)]

      const response: any = await (anthropic.messages as any).create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPromptCached,
        tools: (agentAllowedTools === 'all' ? toolDefinitions : toolDefinitions.filter((t: any) => agentAllowedTools.includes(t.name))) as any,
        messages: messagesToSend,
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

      const stepLog: (typeof steps)[0] = {
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

      messages.push({ role: 'assistant', content: response.content })

      const toolResults: any[] = []

      for (const toolUse of toolUseBlocks) {
        toolCallCount++
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          supabase,
          businessId,
          context
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

    if (!finalResponse) {
      finalResponse = 'Agenten nådde maximalt antal steg.'
    }

    const durationMs = Date.now() - startTime
    const estimatedCost = +(totalTokens * 0.000009).toFixed(4)

    // Log to agent_runs
    const runId =
      'run_' + Math.random().toString(36).substring(2, 14)
    try {
      await supabase
        .from('agent_runs')
        .insert({
          run_id: runId,
          business_id: businessId,
          trigger_type,
          trigger_data: trigger_data || {},
          steps,
          tool_calls: toolCallCount,
          final_response: finalResponse,
          tokens_used: totalTokens,
          estimated_cost: estimatedCost,
          duration_ms: durationMs,
          status: 'completed',
          idempotency_key: idempotency_key || null,
          agent_id: agentId,
          created_at: new Date().toISOString(),
        })
    } catch (insertErr: any) {
      console.error('[agent] Failed to insert agent_run:', insertErr?.message || insertErr)
    }

    // Extract and save memory (fire-and-forget)
    extractAndSaveMemory(businessId, agentId, finalResponse, trigger_type, trigger_data || {}).catch(() => {})

    return NextResponse.json({
      run_id: runId,
      agent_id: agentId,
      trigger_type,
      steps: steps.length,
      tool_calls: toolCallCount,
      tokens_used: totalTokens,
      estimated_cost: estimatedCost,
      duration_ms: durationMs,
      final_response: finalResponse,
      step_details: steps,
    })
  } catch (error: any) {
    console.error('[AgentTrigger] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

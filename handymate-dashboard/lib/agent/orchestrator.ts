/**
 * V6 Orchestrator — tar emot alla events, delegerar till rätt subagent
 *
 * Orchestrator (Sonnet-klassificering utan LLM) → Lead/Ekonomi/Strategi-agent
 * Ersätter den direkta HTTP-baserade handleRunAgent() i automation-engine.
 */

import { getServerSupabase } from '@/lib/supabase'
import {
  fetchBusinessContext,
  runAgentLoop,
  type BusinessContext,
  type AgentRunResult,
} from './agents/shared'
import {
  buildLeadPrompt,
  getLeadTools,
  LEAD_MODEL,
  LEAD_MAX_STEPS,
} from './agents/lead-agent'
import {
  buildEkonomiPrompt,
  getEkonomiTools,
  EKONOMI_MODEL,
  EKONOMI_MAX_STEPS,
} from './agents/ekonomi-agent'
import {
  buildStrategiPrompt,
  getStrategiTools,
  STRATEGI_MODEL,
  STRATEGI_MAX_STEPS,
} from './agents/strategi-agent'

// ── Types ──

export type AgentType = 'lead' | 'ekonomi' | 'strategi'

export interface OrchestrateParams {
  businessId: string
  triggerType: string
  triggerData: Record<string, unknown>
  ruleName: string
  idempotencyKey?: string
}

export interface OrchestrateResult {
  success: boolean
  runId: string
  agentType: AgentType
  finalResponse: string
  steps: number
  toolCalls: number
  tokensUsed: number
  durationMs: number
  escalated: boolean
  error?: string
}

// ── Event classification (zero-LLM) ──

const EVENT_ROUTING: Record<string, AgentType> = {
  // Lead-agent
  lead_created: 'lead',
  contacted: 'lead',
  sms_received: 'lead',
  call_missed: 'lead',
  call_completed: 'lead',
  incoming_sms: 'lead',
  phone_call: 'lead',
  pipeline_stage_changed: 'lead',
  customer_reactivation: 'lead',
  email_received: 'lead',
  gmail_lead_imported: 'lead',
  work_order_sent: 'lead',
  // Ekonomi-agent
  quote_created: 'ekonomi',
  quote_sent: 'ekonomi',
  quote_signed: 'ekonomi',
  quote_expired: 'ekonomi',
  invoice_created: 'ekonomi',
  invoice_sent: 'ekonomi',
  invoice_overdue: 'ekonomi',
  payment_received: 'ekonomi',
}

function classifyEvent(
  triggerType: string,
  triggerData: Record<string, unknown>
): AgentType {
  // Direct event routing
  if (EVENT_ROUTING[triggerType]) {
    return EVENT_ROUTING[triggerType]
  }

  // Check for high-value → strategi direkt
  const estimatedValue = (triggerData?.estimated_value as number) || 0
  if (estimatedValue > 50000) {
    return 'strategi'
  }

  // Keyword matching on instruction/rule_name
  const instruction = ((triggerData?.instruction as string) || '').toLowerCase()
  const ruleName = ((triggerData?.rule_name as string) || '').toLowerCase()
  const combined = `${instruction} ${ruleName}`

  if (
    combined.includes('faktura') ||
    combined.includes('offert') ||
    combined.includes('betalning') ||
    combined.includes('rot') ||
    combined.includes('rut') ||
    combined.includes('invoice') ||
    combined.includes('quote')
  ) {
    return 'ekonomi'
  }

  if (
    combined.includes('lead') ||
    combined.includes('sms') ||
    combined.includes('uppföljning') ||
    combined.includes('kund') ||
    combined.includes('kontakt')
  ) {
    return 'lead'
  }

  // Default: lead-agent (most common automation trigger)
  return 'lead'
}

// ── Main orchestration function ──

export async function orchestrate(params: OrchestrateParams): Promise<OrchestrateResult> {
  const { businessId, triggerType, triggerData, idempotencyKey } = params
  const supabase = getServerSupabase()
  const startTime = Date.now()

  try {
    // 1. Idempotency check
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('agent_runs')
        .select('run_id, status, final_response, tool_calls, duration_ms, agent_type')
        .eq('idempotency_key', idempotencyKey)
        .single()

      if (existing) {
        return {
          success: true,
          runId: existing.run_id,
          agentType: (existing.agent_type as AgentType) || 'lead',
          finalResponse: existing.final_response || '',
          steps: 0,
          toolCalls: existing.tool_calls || 0,
          tokensUsed: 0,
          durationMs: existing.duration_ms || 0,
          escalated: false,
        }
      }
    }

    // 2. Fetch business context
    const ctx = await fetchBusinessContext(supabase, businessId)
    if (!ctx) {
      return {
        success: false,
        runId: '',
        agentType: 'lead',
        finalResponse: '',
        steps: 0,
        toolCalls: 0,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        escalated: false,
        error: 'Business config not found',
      }
    }

    // 3. Classify event
    let agentType = classifyEvent(triggerType, triggerData)

    // 4. Build user message
    const userMessage = triggerData?.instruction
      ? (triggerData.instruction as string)
      : `Hantera denna ${triggerType}-trigger.`

    // 5. Run the appropriate sub-agent
    let result: AgentRunResult
    let escalated = false

    if (agentType === 'strategi') {
      // Direct to strategi (high value, complex)
      result = await runStrategiAgent(ctx, triggerType, triggerData, userMessage)
    } else if (agentType === 'ekonomi') {
      result = await runEkonomiAgent(ctx, triggerType, triggerData, userMessage)
    } else {
      result = await runLeadAgent(ctx, triggerType, triggerData, userMessage)
    }

    // 6. Handle escalation
    if (result.escalation) {
      // Log the Haiku run first
      const haikuRunId = generateRunId()
      await logAgentRun(supabase, {
        runId: haikuRunId,
        businessId,
        triggerType,
        triggerData,
        agentType,
        result,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-haiku` : undefined,
      })

      // Run Strategi-agent with escalation context
      const strResult = await runStrategiAgent(
        ctx,
        triggerType,
        triggerData,
        userMessage,
        result.escalation
      )

      // Log the Strategi run
      agentType = 'strategi'
      escalated = true

      const strRunId = generateRunId()
      await logAgentRun(supabase, {
        runId: strRunId,
        businessId,
        triggerType,
        triggerData,
        agentType: 'strategi',
        result: strResult,
        idempotencyKey: idempotencyKey || undefined,
      })

      return {
        success: true,
        runId: strRunId,
        agentType: 'strategi',
        finalResponse: strResult.finalResponse,
        steps: result.steps.length + strResult.steps.length,
        toolCalls: result.toolCallCount + strResult.toolCallCount,
        tokensUsed: result.tokensUsed + strResult.tokensUsed,
        durationMs: Date.now() - startTime,
        escalated: true,
      }
    }

    // 7. Log to agent_runs (no escalation)
    const runId = generateRunId()
    await logAgentRun(supabase, {
      runId,
      businessId,
      triggerType,
      triggerData,
      agentType,
      result,
      idempotencyKey: idempotencyKey || undefined,
    })

    return {
      success: true,
      runId,
      agentType,
      finalResponse: result.finalResponse,
      steps: result.steps.length,
      toolCalls: result.toolCallCount,
      tokensUsed: result.tokensUsed,
      durationMs: Date.now() - startTime,
      escalated,
    }
  } catch (err: any) {
    console.error('[Orchestrator] Error:', err)
    return {
      success: false,
      runId: '',
      agentType: 'lead',
      finalResponse: '',
      steps: 0,
      toolCalls: 0,
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
      escalated: false,
      error: err.message,
    }
  }
}

// ── Agent runners ──

async function runLeadAgent(
  ctx: BusinessContext,
  triggerType: string,
  triggerData: Record<string, unknown>,
  userMessage: string
): Promise<AgentRunResult> {
  const supabase = getServerSupabase()
  return runAgentLoop(
    {
      model: LEAD_MODEL,
      systemPrompt: buildLeadPrompt(ctx, triggerType, triggerData),
      tools: getLeadTools(),
      maxSteps: LEAD_MAX_STEPS,
      userMessage,
    },
    supabase,
    ctx.bizConfig.business_id,
    ctx.toolContext
  )
}

async function runEkonomiAgent(
  ctx: BusinessContext,
  triggerType: string,
  triggerData: Record<string, unknown>,
  userMessage: string
): Promise<AgentRunResult> {
  const supabase = getServerSupabase()
  return runAgentLoop(
    {
      model: EKONOMI_MODEL,
      systemPrompt: buildEkonomiPrompt(ctx, triggerType, triggerData),
      tools: getEkonomiTools(),
      maxSteps: EKONOMI_MAX_STEPS,
      userMessage,
    },
    supabase,
    ctx.bizConfig.business_id,
    ctx.toolContext
  )
}

async function runStrategiAgent(
  ctx: BusinessContext,
  triggerType: string,
  triggerData: Record<string, unknown>,
  userMessage: string,
  escalation?: { reason: string; findings: string; recommendedAction?: string }
): Promise<AgentRunResult> {
  const supabase = getServerSupabase()
  return runAgentLoop(
    {
      model: STRATEGI_MODEL,
      systemPrompt: buildStrategiPrompt(ctx, triggerType, triggerData, escalation),
      tools: getStrategiTools(),
      maxSteps: STRATEGI_MAX_STEPS,
      userMessage: escalation
        ? `Eskalering: ${escalation.reason}\n\nAnalys: ${escalation.findings}\n\n${userMessage}`
        : userMessage,
    },
    supabase,
    ctx.bizConfig.business_id,
    ctx.toolContext
  )
}

// ── Helpers ──

function generateRunId(): string {
  return 'run_' + Math.random().toString(36).substring(2, 14)
}

async function logAgentRun(
  supabase: ReturnType<typeof getServerSupabase>,
  params: {
    runId: string
    businessId: string
    triggerType: string
    triggerData: Record<string, unknown>
    agentType: AgentType
    result: AgentRunResult
    idempotencyKey?: string
  }
): Promise<void> {
  const { runId, businessId, triggerType, triggerData, agentType, result, idempotencyKey } = params
  const estimatedCost = +(result.tokensUsed * 0.000009).toFixed(4)

  try {
    await supabase
      .from('agent_runs')
      .insert({
        run_id: runId,
        business_id: businessId,
        trigger_type: triggerType,
        trigger_data: triggerData || {},
        steps: result.steps,
        tool_calls: result.toolCallCount,
        final_response: result.finalResponse,
        tokens_used: result.tokensUsed,
        estimated_cost: estimatedCost,
        duration_ms: result.durationMs,
        status: 'completed',
        agent_type: agentType,
        idempotency_key: idempotencyKey || null,
        created_at: new Date().toISOString(),
      })
  } catch (err: any) {
    console.error('[Orchestrator] Failed to log agent_run:', err?.message || err)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

import { toolDefinitions } from './tool-definitions'
import { buildSystemPrompt } from './system-prompt'
import { executeTool } from './tool-router'

// This route allows triggering the AI agent from the dashboard
// without going through Supabase Edge Functions — useful for testing
// and for the manual trigger use case.

const MAX_STEPS = 10
const MODEL = 'claude-sonnet-4-20250514'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { trigger_type, trigger_data } = body

    if (!trigger_type) {
      return NextResponse.json(
        { error: 'Missing trigger_type' },
        { status: 400 }
      )
    }

    const supabase = getServerSupabase()
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })

    // Fetch full business config for the system prompt
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select(
        'business_id, business_name, contact_name, contact_email, branch, service_area, phone_number, assigned_phone_number, pricing_settings, knowledge_base, working_hours'
      )
      .eq('business_id', business.business_id)
      .single()

    if (!bizConfig) {
      return NextResponse.json(
        { error: 'Business config not found' },
        { status: 404 }
      )
    }

    const systemPrompt = buildSystemPrompt(
      bizConfig,
      trigger_type,
      trigger_data
    )

    const context = {
      businessName: bizConfig.business_name || 'Handymate',
      contactEmail: bizConfig.contact_email || '',
    }

    // Build initial user message
    const userMessage = trigger_type === 'manual'
      ? (trigger_data?.instruction || 'Utför den begärda uppgiften.')
      : `Hantera denna ${trigger_type}-trigger.`

    // Use any[] for messages to avoid SDK version type conflicts
    const messages: any[] = [
      { role: 'user', content: userMessage as string },
    ]

    const steps: Array<{
      step: number
      content?: string
      tool_calls?: Array<{ tool: string; input: unknown; result: unknown }>
    }> = []
    let totalTokens = 0
    let toolCallCount = 0
    let finalResponse = ''

    const startTime = Date.now()

    for (let step = 0; step < MAX_STEPS; step++) {
      const response: any = await (anthropic.messages as any).create({
        model: MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        tools: toolDefinitions as any,
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
          business.business_id,
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
    await supabase
      .from('agent_runs')
      .insert({
        run_id: runId,
        business_id: business.business_id,
        trigger_type,
        trigger_data: trigger_data || {},
        steps,
        tool_calls: toolCallCount,
        final_response: finalResponse,
        tokens_used: totalTokens,
        estimated_cost: estimatedCost,
        duration_ms: durationMs,
        status: 'completed',
        created_at: new Date().toISOString(),
      })
      .catch(() => {
        // Non-blocking
      })

    return NextResponse.json({
      run_id: runId,
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

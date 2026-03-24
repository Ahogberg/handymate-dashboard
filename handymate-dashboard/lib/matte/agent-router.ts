/**
 * V34 — Agent Router: Kopplar Mattes beslut till befintlig agent-trigger.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { MatteDecision, IncomingSignal } from './intent-agent'
import type { ResolvedEntity } from './resolver'

/**
 * Triggar rätt specialist-agent baserat på Mattes beslut.
 * Använder befintlig /api/agent/trigger med X-Internal-Secret.
 */
export async function routeToAgentWithContext(
  agentId: string,
  signal: IncomingSignal,
  entity: ResolvedEntity,
  decision: MatteDecision,
  businessId: string,
  supabase: SupabaseClient
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const cronSecret = process.env.CRON_SECRET

  // Logga routing-beslutet
  await supabase.from('v3_automation_logs').insert({
    business_id: businessId,
    rule_name: 'matte_agent_routing',
    trigger_type: 'matte_routed',
    action_type: `route_to_${agentId}`,
    status: 'completed',
    context: {
      intent: decision.intent,
      confidence: decision.confidence,
      routed_to: agentId,
      channel: signal.channel,
      customer: entity.customerName,
    },
    result: { actions_pending: decision.actions.filter(a => !a.autonomous).length },
  })
  // eslint-disable-next-line -- fire-and-forget logging

  // Trigga agenten via befintlig infrastruktur
  try {
    await fetch(`${appUrl}/api/agent/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret ? { 'X-Internal-Secret': cronSecret } : {}),
      },
      body: JSON.stringify({
        business_id: businessId,
        trigger_type: signal.channel === 'sms' ? 'incoming_sms' : 'email_received',
        agent_id: agentId,
        trigger_data: {
          routed_by: 'matte',
          intent: decision.intent,
          confidence: decision.confidence,
          from: signal.from,
          body: signal.body,
          subject: signal.subject,
          entity_type: entity.type,
          customer_id: entity.customerId,
          lead_id: entity.leadId,
          customer_name: entity.customerName,
          reasoning: decision.reasoning,
          pending_actions: decision.actions.filter(a => !a.autonomous).map(a => ({
            type: a.type,
            description: a.description,
          })),
        },
      }),
    })
  } catch (err) {
    console.error('[agent-router] Failed to trigger agent:', err)
  }
}

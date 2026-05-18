/**
 * Delad save-and-push pipeline för agent-observations.
 *
 * Per observation:
 * 1. INSERT i business_knowledge med rätt agent_id
 * 2. Om suggestion finns → INSERT pending_approval (approval_type='agent_observation')
 *    + skicka push (sendApprovalPush med agent_observation-template)
 * 3. Om ingen suggestion → bara push (approval_type='agent_insight', INGEN approval-rad)
 * 4. Returnera counters: saved, approvals_created, insights_pushed
 *
 * Tidigare hardcodad till 'karin' i lib/agents/karin/observation-prompt.ts
 * (rad 840, 869, 906). Nu tar agentId som parameter så Daniel/Lars/Hanna
 * kan återanvända identiskt flöde.
 *
 * Extraherat 2026-05-18 vid Phase A2.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import type { AgentObservation } from './normalize'

export interface SaveAndPushResult {
  saved: number
  approvals_created: number
  insights_pushed: number
}

export async function saveAndPush(
  supabase: SupabaseClient,
  businessId: string,
  agentId: string,
  observations: AgentObservation[],
): Promise<SaveAndPushResult> {
  let saved = 0
  let approvalsCreated = 0
  let insightsPushed = 0

  for (const obs of observations) {
    const { data: savedRow, error: saveErr } = await supabase
      .from('business_knowledge')
      .insert({
        business_id: businessId,
        agent_id: agentId,
        knowledge_type: obs.knowledge_type,
        title: obs.title,
        observation: obs.observation,
        suggestion: obs.suggestion,
        confidence: obs.confidence,
        data_basis: obs.data_basis,
        status: 'active',
      })
      .select('id')
      .single()

    if (saveErr) {
      console.error(`[${agentId}/save] insert error:`, saveErr)
      continue
    }
    saved++

    const knowledgeId = savedRow?.id || null

    if (obs.suggestion && obs.suggestion.trim().length > 0) {
      // Observation MED konkret action → skapa approval + push
      const { data: approval } = await supabase
        .from('pending_approvals')
        .insert({
          business_id: businessId,
          approval_type: 'agent_observation',
          title: obs.title,
          description: obs.observation,
          payload: {
            agent_id: agentId,
            business_knowledge_id: knowledgeId,
            observation: obs.observation,
            suggestion: obs.suggestion,
            confidence: obs.confidence,
            data_basis: obs.data_basis,
            knowledge_type: obs.knowledge_type,
            routed_agent: agentId,
          },
          status: 'pending',
          risk_level: obs.confidence > 0.8 ? 'medium' : 'low',
        })
        .select('id')
        .single()

      if (approval?.id && knowledgeId) {
        await supabase
          .from('business_knowledge')
          .update({ related_approval_id: approval.id })
          .eq('id', knowledgeId)
      }

      void sendApprovalPush({
        business_id: businessId,
        approval_type: 'agent_observation',
        payload: {
          agent_id: agentId,
          title: obs.title,
          observation: obs.observation,
        },
      })
      approvalsCreated++
    } else {
      // Ren info utan suggestion → bara push, ingen approval-rad
      void sendApprovalPush({
        business_id: businessId,
        approval_type: 'agent_insight',
        payload: {
          agent_id: agentId,
          title: obs.title,
          observation: obs.observation,
        },
      })
      insightsPushed++
    }
  }

  return { saved, approvals_created: approvalsCreated, insights_pushed: insightsPushed }
}

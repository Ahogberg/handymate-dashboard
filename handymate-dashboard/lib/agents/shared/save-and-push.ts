/**
 * Delad save-and-push pipeline för agent-observations.
 *
 * Per observation:
 * 1. Beräkna dedup_key (lib/agents/shared/dedup.ts)
 * 2. Slå upp recent duplicate inom fönster för knowledge_type
 *    - Om duplicate → skip INSERT + skip push, logga i skipped_details
 * 3. INSERT i business_knowledge med rätt agent_id + dedup_key
 * 4. Om suggestion finns → INSERT pending_approval (approval_type='agent_observation')
 *    + skicka push (sendApprovalPush med agent_observation-template)
 * 5. Om ingen suggestion → bara push (approval_type='agent_insight', INGEN approval-rad)
 * 6. Returnera counters: saved, approvals_created, insights_pushed, skipped_duplicates + details
 *
 * Tidigare hardcodad till 'karin' i lib/agents/karin/observation-prompt.ts
 * (rad 840, 869, 906). Nu tar agentId som parameter så Daniel/Lars/Hanna
 * kan återanvända identiskt flöde.
 *
 * Extraherat 2026-05-18 vid Phase A2. Dedup-stöd lagt 2026-05-18 (Commit 2/3).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import type { AgentObservation } from './normalize'
import {
  computeDedupKey,
  findRecentDuplicate,
  getDedupWindowHours,
} from './dedup'

export interface DedupSkipDetail {
  title: string
  dedup_key: string
  knowledge_type: string
  window_hours: number
  existing_id: string
  existing_created_at: string
}

export interface SaveAndPushResult {
  saved: number
  approvals_created: number
  insights_pushed: number
  skipped_duplicates: number
  skipped_details: DedupSkipDetail[]
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
  let skippedDuplicates = 0
  const skippedDetails: DedupSkipDetail[] = []

  for (const obs of observations) {
    // ── Dedup-check ────────────────────────────────────────────
    const dedupKey = computeDedupKey(agentId, obs)
    const windowHours = getDedupWindowHours(obs.knowledge_type)
    const existing = await findRecentDuplicate(
      supabase,
      businessId,
      agentId,
      dedupKey,
      windowHours,
    )

    if (existing) {
      console.log(
        `[dedup] skipped agent=${agentId} key=${dedupKey} window=${windowHours}h existing_id=${existing.id}`,
      )
      skippedDuplicates++
      skippedDetails.push({
        title: obs.title,
        dedup_key: dedupKey,
        knowledge_type: obs.knowledge_type,
        window_hours: windowHours,
        existing_id: existing.id,
        existing_created_at: existing.created_at,
      })
      continue
    }

    // ── INSERT business_knowledge ─────────────────────────────
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
        dedup_key: dedupKey,
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
      // Observation MED konkret action → skapa approval + push.
      //
      // Steg 3 Dag 2 (2026-05-28): Om obs.action finns blir approval typed
      // (t.ex. 'send_sms') så approve faktiskt skickar SMS via befintlig
      // executeApprovalPayload-switch. Utan action → legacy generic
      // 'agent_observation' som bara markerar acknowledged.
      const isTypedSms = obs.action?.type === 'send_sms'
      const approvalType = isTypedSms ? 'send_sms' : 'agent_observation'

      const approvalPayload: Record<string, unknown> = {
        agent_id: agentId,
        business_knowledge_id: knowledgeId,
        observation: obs.observation,
        suggestion: obs.suggestion,
        confidence: obs.confidence,
        data_basis: obs.data_basis,
        knowledge_type: obs.knowledge_type,
        routed_agent: agentId,
      }

      // Typed SMS-action: inkludera de fält som approve-handlern + UI behöver.
      if (isTypedSms && obs.action?.type === 'send_sms') {
        approvalPayload.to = obs.action.to
        approvalPayload.message = obs.action.message
        if (obs.action.customer_id) approvalPayload.customer_id = obs.action.customer_id
        if (obs.action.customer_name) approvalPayload.customer_name = obs.action.customer_name
        if (obs.action.related_id) approvalPayload.related_id = obs.action.related_id
      }

      const { data: approval } = await supabase
        .from('pending_approvals')
        .insert({
          business_id: businessId,
          approval_type: approvalType,
          title: obs.title,
          description: obs.observation,
          payload: approvalPayload,
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
        approval_type: approvalType,
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

  return {
    saved,
    approvals_created: approvalsCreated,
    insights_pushed: insightsPushed,
    skipped_duplicates: skippedDuplicates,
    skipped_details: skippedDetails,
  }
}

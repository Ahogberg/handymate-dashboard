import { createHash, randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CallPipelineResult {
  action: string
  leadId?: string
  dealId?: string
  customerId?: string
  aiConfidence: number
  reviewReason?: string
}

export interface CallProcessingState {
  phase?: 'processing' | 'complete' | 'partial' | 'failed' | 'expired'
  result?: Record<string, any>
  pipeline?: CallPipelineResult
  error_code?: string | null
  lease_until?: string
  notified_at?: string
  version?: number
}

/** Stable across retries, independent of customer linkage and execution status. */
export function callCardId(businessId: string, recordingId: string, key: string): string {
  return `appr_call_${createHash('sha256').update(JSON.stringify([businessId, recordingId, key])).digest('hex').slice(0, 32)}`
}

export function callRecordingId(businessId: string, providerCallId: string): string {
  return `rec_${createHash('sha256').update(JSON.stringify([businessId, providerCallId])).digest('hex').slice(0, 32)}`
}

export async function callProcessingRpc(
  supabase: SupabaseClient, businessId: string, recordingId: string,
  operation: string, token: string, data: Record<string, unknown> = {},
): Promise<any> {
  const result = await supabase.rpc('manage_call_processing', {
    p_business_id: businessId, p_recording_id: recordingId,
    p_operation: operation, p_token: token, p_data: data,
  })
  if (result.error) throw new Error(`Samtalsbearbetningen kunde inte sparas (${result.error.code || 'database'}).`)
  return result.data
}

export async function claimCallProcessing(supabase: SupabaseClient, businessId: string, recordingId: string) {
  const token = randomUUID()
  const result = await callProcessingRpc(supabase, businessId, recordingId, 'claim', token)
  return { ...result, token } as { status: 'claimed' | 'busy' | 'complete' | 'legacy' | 'expired'; state: CallProcessingState; token: string }
}

/** No upsert of resolved approvals. SQL inserts all missing cards atomically. */
export async function publishCallCards(
  supabase: SupabaseClient, businessId: string, recordingId: string, token: string,
  cards: Array<Record<string, unknown>>, pipelineFailed: boolean,
) {
  const keyed = cards.map((card, index) => {
    const payload = (card.payload || {}) as Record<string, unknown>
    const key = card.approval_type === 'meeting_summary' ? 'summary' : String(payload.call_card_key ?? `card:${index}`)
    return { ...card, id: callCardId(businessId, recordingId, key), payload: { ...payload, recording_id: recordingId } }
  })
  return callProcessingRpc(supabase, businessId, recordingId, 'publish', token, {
    cards: keyed, pipeline_failed: pipelineFailed,
  }) as Promise<{ cards_created: number; status: 'complete' | 'partial' }>
}

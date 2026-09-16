import type { SupabaseClient } from '@supabase/supabase-js'
import type { AutonomyKey } from '@/lib/autonomy/earned-autonomy'
import type { Channel, ChannelReason } from '@/lib/channels/preflight'

export const MAX_OUTBOUND_ATTEMPTS = 3
export const STALE_OUTBOUND_MINUTES = 10
export const outboundIntentsEnabled = () => process.env.OUTBOUND_INTENTS_ENABLED === 'true'
export type OutboundSource = 'approval' | 'automation_log' | 'autonomy' | 'cron' | 'manual'
export type OutboundStatus = 'pending' | 'attempting' | 'sent' | 'failed' | 'skipped' | 'unknown'
export interface OutboundPromise {
  businessId: string
  kind: Channel
  source: OutboundSource
  sourceId: string
  dedupeKey: string
  recipient: string
  template: string
  autonomyKey?: AutonomyKey
  /** Source locator/version only. Never body, attachments or provider credentials. */
  context?: { version?: string; targetUserId?: string; fromAddress?: string; auditId?: string }
}
export interface ClaimedOutbound {
  id: string; kind: Channel; source: OutboundSource; source_id: string
  dedupe_key: string
  recipient: string; template: string; autonomy_key: AutonomyKey | null
  attempts: number; attempt_token: string; context: OutboundPromise['context'] | null
}
export interface OutboundClaim {
  claimed: ClaimedOutbound[]; unknown_ids: string[]; cancelled_ids: string[]
}
export interface OutboundReceipt {
  status: OutboundStatus
  provider_ref: string | null
  cancel_requested_at: string | null
}
/** A lost claim race is not proof of pending work: another worker may already
 * have finished. Read the durable receipt without invoking any producer. */
export async function readOutboundReceipt(db: SupabaseClient, businessId: string, id: string): Promise<OutboundReceipt> {
  const { data, error } = await db.from('outbound_intents')
    .select('status,provider_ref,cancel_requested_at').eq('business_id', businessId).eq('id', id).maybeSingle()
  if (error || !data) throw new Error('outbound_receipt_unavailable')
  return data as OutboundReceipt
}
export async function outboundRpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  if (data === null || data === undefined) throw new Error(`${name}: missing receipt`)
  return data as T
}
export async function recordOutboundIntent(db: SupabaseClient, p: OutboundPromise, deferReason: ChannelReason | null = null) {
  for (const field of [p.businessId, p.sourceId, p.dedupeKey, p.recipient, p.template]) {
    if (typeof field !== 'string' || !field.trim()) throw new TypeError('outbound_identity_required')
  }
  if (p.context && Object.keys(p.context).some(key => !['version', 'targetUserId', 'fromAddress', 'auditId'].includes(key))) {
    throw new TypeError('outbound_context_must_only_identify_source')
  }
  return outboundRpc<{ id?: string; status?: OutboundStatus; provider_ref?: string | null; cancel_requested?: boolean; created: boolean; blocked?: boolean; deferred?: boolean }>(db, 'record_outbound_intent', {
    p_business_id: p.businessId, p_kind: p.kind, p_source: p.source, p_source_id: p.sourceId,
    p_dedupe_key: p.dedupeKey, p_recipient: p.recipient, p_template: p.template,
    // The SQL autonomy fence is meaningful only while supervised autonomy is
    // enabled. OUTBOUND may be rolled out first without turning existing
    // booking/review/follow-up traffic into blocked promises.
    p_autonomy_key: process.env.SUPERVISED_AUTONOMY_ENABLED === 'true' ? p.autonomyKey ?? null : null,
    p_context: p.context ?? null, p_defer_reason: deferReason,
  })
}
export function claimOutboundIntents(db: SupabaseClient, businessId: string, ids: string[] | null = null, limit = 1) {
  return outboundRpc<OutboundClaim>(db, 'claim_outbound_intents', {
    p_business_id: businessId, p_ids: ids, p_max_attempts: MAX_OUTBOUND_ATTEMPTS,
    p_stale_minutes: STALE_OUTBOUND_MINUTES, p_limit: limit,
  })
}
export function finishOutboundIntent(db: SupabaseClient, businessId: string, intent: ClaimedOutbound,
  status: 'sent' | 'failed' | 'skipped', providerRef: string | null = null, error: string | null = null) {
  return outboundRpc<{ id: string; status: OutboundStatus; cancel_requested?: boolean; idempotent: boolean }>(db, 'finish_outbound_intent', {
    p_business_id: businessId, p_id: intent.id, p_attempt_token: intent.attempt_token,
    p_status: status, p_provider_ref: providerRef, p_error: error, p_max_attempts: MAX_OUTBOUND_ATTEMPTS,
  })
}
export function cancelOutboundIntents(db: SupabaseClient, businessId: string, key: AutonomyKey, reason: string) {
  return outboundRpc<{ cancelled: number; in_flight: number }>(db, 'cancel_outbound_intents', {
    p_business_id: businessId, p_autonomy_key: key, p_reason: reason,
  })
}
export function listOwedOutboundIntents(db: SupabaseClient, limit = 50) {
  return outboundRpc<{ business_id: string; owed: number; stale: number }[]>(db, 'list_owed_outbound_intents', {
    p_max_attempts: MAX_OUTBOUND_ATTEMPTS, p_stale_minutes: STALE_OUTBOUND_MINUTES, p_limit: limit,
  })
}
export function resolveOutboundIntent(db: SupabaseClient, businessId: string, id: string,
  resolution: 'delivered' | 'abandon' | 'retry', actor: string, reason: string) {
  return outboundRpc(db, 'resolve_outbound_intent', {
    p_business_id: businessId, p_id: id, p_resolution: resolution, p_actor_id: actor,
    p_reason: reason, p_max_attempts: MAX_OUTBOUND_ATTEMPTS,
  })
}
export function listUnresolvedOutboundIntents(db: SupabaseClient, businessId: string) {
  return outboundRpc<unknown[]>(db, 'list_unresolved_outbound_intents', {
    p_business_id: businessId, p_max_attempts: MAX_OUTBOUND_ATTEMPTS, p_limit: 100,
  })
}
export function deferOutboundIntent(db: SupabaseClient, businessId: string, id: string, reason: ChannelReason, token: string | null = null) {
  return outboundRpc<{ deferred: boolean; status: OutboundStatus }>(db, 'defer_outbound_intent', {
    p_business_id: businessId, p_id: id, p_attempt_token: token, p_reason: reason,
  })
}
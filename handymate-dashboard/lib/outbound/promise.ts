import type { SupabaseClient } from '@supabase/supabase-js'
import { gateChannel, type ChannelState } from '@/lib/channels/preflight'
import {
  recordOutboundIntent, claimOutboundIntents, finishOutboundIntent, deferOutboundIntent, readOutboundReceipt,
  type OutboundPromise, type OutboundStatus, type ClaimedOutbound,
} from './intents'

export interface ProviderOutcome {
  status: 'sent' | 'failed' | 'skipped' | 'unknown'
  providerRef?: string
  error?: string
}
export interface PromiseOutcome {
  id?: string
  status: OutboundStatus
  providerRef?: string
  receiptConfirmed: boolean
  cancelRequested?: boolean
}
export type Preflight = (db: SupabaseClient, businessId: string, kind: OutboundPromise['kind'],
  options?: Parameters<typeof gateChannel>[3]) => Promise<ChannelState>

/** Only call after the producer has persisted and authorized its source. This
 * wrapper never invents an identity, message body or permission to send. */
export async function withOutboundPromise(db: SupabaseClient, p: OutboundPromise,
  send: (intent: ClaimedOutbound) => Promise<ProviderOutcome>, preflight: Preflight = gateChannel): Promise<PromiseOutcome> {
  const recorded = await recordOutboundIntent(db, p)
  return dispatchRecordedOutbound(db, p, recorded, send, preflight)
}

export async function dispatchRecordedOutbound(db: SupabaseClient, p: OutboundPromise,
  recorded: { id?: string; status?: OutboundStatus; provider_ref?: string | null; cancel_requested?: boolean },
  send: (intent: ClaimedOutbound) => Promise<ProviderOutcome>, preflight: Preflight = gateChannel): Promise<PromiseOutcome> {
  if (!recorded.id) return { status: 'skipped', receiptConfirmed: false }
  if (['sent', 'skipped', 'unknown', 'attempting'].includes(recorded.status!)) {
    return { id: recorded.id, status: recorded.status!, providerRef: recorded.provider_ref ?? undefined,
      cancelRequested: recorded.cancel_requested, receiptConfirmed: true }
  }
  const state = await checkedPreflight(db, p.businessId, p.kind, p.context, preflight)
  if (!state.ok) {
    const deferred = await deferOutboundIntent(db, p.businessId, recorded.id, state.reason ?? 'kontrollfel')
    return { id: recorded.id, status: deferred.status, receiptConfirmed: true }
  }
  const claims = await claimOutboundIntents(db, p.businessId, [recorded.id])
  const claimed = claims.claimed[0]
  if (!claimed) {
    // No claim is not a delivery acknowledgement. Another worker may own it,
    // it may be in backoff, or off may have cancelled it.
    try {
      const receipt = await readOutboundReceipt(db, p.businessId, recorded.id)
      return { id: recorded.id, status: receipt.status, providerRef: receipt.provider_ref ?? undefined,
        cancelRequested: !!receipt.cancel_requested_at, receiptConfirmed: true }
    } catch {
      return { id: recorded.id, status: 'unknown', receiptConfirmed: false }
    }
  }
  return dispatchClaimedOutbound(db, p.businessId, claimed, send)
}

export async function checkedPreflight(db: SupabaseClient, businessId: string, kind: OutboundPromise['kind'],
  options: Parameters<typeof gateChannel>[3], check: Preflight = gateChannel): Promise<ChannelState> {
  try { return await check(db, businessId, kind, options) }
  catch { return { channel: kind, ok: false, reason: 'kontrollfel', message: 'Sändtjänsten kunde inte kontrolleras.', href: '/dashboard/help' } }
}

/** An ambiguous provider result or lost finish remains attempting until SQL
 * promotes it to unknown. In particular it is NEVER recorded as failed. */
export async function dispatchClaimedOutbound(db: SupabaseClient, businessId: string, intent: ClaimedOutbound,
  send: (intent: ClaimedOutbound) => Promise<ProviderOutcome>): Promise<PromiseOutcome> {
  // Resolving a source or checking a provider may take time. Recheck the
  // durable fence after preparation so off/stale recovery wins before send.
  const current = await db.from('outbound_intents').select('status,attempt_token,cancel_requested_at')
    .eq('business_id', businessId).eq('id', intent.id).maybeSingle()
  if (current.error || !current.data || current.data.status !== 'attempting' || current.data.attempt_token !== intent.attempt_token) {
    return { id: intent.id, status: 'unknown', receiptConfirmed: false }
  }
  if (current.data.cancel_requested_at) {
    const stopped = await finishOutboundIntent(db, businessId, intent, 'skipped', null, 'Avstängt före leverantörsanropet')
    return { id: intent.id, status: stopped.status, receiptConfirmed: true }
  }
  let result: ProviderOutcome
  try { result = await send(intent) }
  catch { return { id: intent.id, status: 'unknown', receiptConfirmed: false } }
  if (result.status === 'unknown') return { id: intent.id, status: 'unknown', receiptConfirmed: false }
  try {
    const finish = await finishOutboundIntent(db, businessId, intent, result.status, result.providerRef ?? null, result.error ?? null)
    return { id: intent.id, status: finish.status, providerRef: result.providerRef, receiptConfirmed: true, cancelRequested: finish.cancel_requested }
  } catch {
    // The provider receipt is useful but the durable outcome is uncertain.
    return { id: intent.id, status: 'unknown', providerRef: result.providerRef, receiptConfirmed: false }
  }
}

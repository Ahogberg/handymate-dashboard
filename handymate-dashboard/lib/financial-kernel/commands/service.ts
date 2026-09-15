import type { KernelDb } from '../events/publish'
import { domainRpc } from '../receivables/service'

export interface PaymentCommandOutcome {
  command: { command_id: string; route: 'legacy' | 'kernel'; state: 'executed' | 'already_paid' | 'legacy_routed' | 'no_new_money' | 'provider_below_kernel';
    payment_id?: string; replayed: boolean; settled_now?: string[]; effects_suppressed?: string[] }
  projection: { status?: string; derived_status: string | null; recorded_minor: string; unallocated_minor: string;
    paid_at?: string | null; settled_at?: string | null; intents_owed: number; intents_unknown: number;
    receivables: { id: string; component: string; status: string; outstanding_minor: string }[] }
}
export interface EffectClaim {
  id: string; command_id: string | null; effect: string; attempts: number; attempt_token: string;
  context: { source: 'manual' | 'status_patch' | 'customer_confirmed' | 'fortnox' | 'bridge'; approvalFollowUps?: {
    approvalId: string; updateWorkflows: boolean; prepareCustomerMessages: boolean; runAutomationRules: boolean
  }; paidAmountMinor: string }
}
export async function executePaymentCommand(db: KernelDb, args: Record<string, unknown>): Promise<PaymentCommandOutcome> {
  const out = await domainRpc(db, 'execute_payment_command', args)
  if (!out.command || !out.projection) throw new TypeError('Invalid payment command response')
  const result = out as unknown as PaymentCommandOutcome
  for (const amount of [result.projection.recorded_minor, result.projection.unallocated_minor]) {
    if (typeof amount !== 'string' || !/^-?\d+$/.test(amount)) throw new TypeError('Invalid minor-unit transport')
  }
  return result
}
export async function claimEffectIntents(db: KernelDb, businessId: string, invoiceId: string) {
  return await domainRpc(db, 'claim_effect_intents', { p_business_id: businessId, p_invoice_id: invoiceId, p_max_attempts: 3, p_stale_minutes: 10 }) as unknown as {
    claimed: EffectClaim[]; marked_unknown: number; unknown_ids: string[]
  }
}
export async function finishEffectIntent(db: KernelDb, businessId: string, intent: EffectClaim, status: 'sent' | 'failed' | 'skipped', result: unknown, error?: string) {
  return domainRpc(db, 'finish_effect_intent', { p_business_id: businessId, p_intent_id: intent.id, p_attempt_token: intent.attempt_token,
    p_status: status, p_result: result, p_error: error ?? null })
}


export async function ensureEffectIntents(db: KernelDb, businessId: string, receivableId: string,
  eventId: string, effects: string[], context: Record<string, unknown>) {
  return domainRpc(db, 'ensure_effect_intents', { p_business_id: businessId, p_receivable_id: receivableId,
    p_source_event_id: eventId, p_effects: effects, p_context: context })
}
async function listRpc<T>(db: KernelDb, name: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw new Error(error.message)
  if (!Array.isArray(data)) throw new TypeError('Invalid list RPC response')
  return data as T[]
}
export function listOwedEffectIntents(db: KernelDb, businessId: string) {
  return listRpc<{ invoice_id: string; owed: number; stale: number }>(db, 'list_owed_effect_intents', {
    p_business_id: businessId, p_max_attempts: 3, p_stale_minutes: 10, p_limit: 50,
  })
}
export interface UnresolvedEffectIntent {
  id: string; invoice_id: string; receivable_id: string; effect: string; status: 'unknown' | 'failed';
  attempts: number; last_error: string | null; command_id: string | null; source_event_id: string | null;
  claimed_at: string | null; finished_at: string | null;
  resolution: { at: string; by: string; from: string; to: string; reason: string }[] | null
}
export function listUnresolvedEffectIntents(db: KernelDb, businessId: string) {
  return listRpc<UnresolvedEffectIntent>(db, 'list_unresolved_effect_intents', {
    p_business_id: businessId, p_max_attempts: 3, p_limit: 100,
  })
}
export type EffectResolution = 'delivered' | 'abandon' | 'retry'
export function resolveEffectIntent(db: KernelDb, businessId: string, intentId: string,
  resolution: EffectResolution, actorId: string, reason: string) {
  return domainRpc(db, 'resolve_effect_intent', { p_business_id: businessId, p_intent_id: intentId,
    p_resolution: resolution, p_actor_id: actorId, p_reason: reason, p_max_attempts: 3 })
}

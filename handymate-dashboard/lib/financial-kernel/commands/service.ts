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
  id: string; command_id: string; effect: string; attempts: number; attempt_token: string;
  context: { source: 'manual' | 'status_patch' | 'customer_confirmed' | 'fortnox'; approvalFollowUps?: {
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

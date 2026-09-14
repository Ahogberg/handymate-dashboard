import type { RawFortnoxShadowSnapshot } from '@/lib/fortnox/shadow-adapter'
import type { KernelDb } from '../events/publish'
import { domainRpc } from '../receivables/service'
import type { KernelPhase } from '../phase'
import type { HandymateInvoiceSnapshot } from './compare'

export interface KernelWork { business_id: string; phase: KernelPhase; consume: boolean; sweep: boolean; owed_intents: number }
async function list<T>(db: KernelDb, name: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw new Error(error.message)
  if (!Array.isArray(data)) throw new TypeError('Invalid shadow list response')
  return data as T[]
}
export function listFinancialKernelWork(db: KernelDb) { return list<KernelWork>(db, 'list_financial_kernel_work', {}) }
export function listShadowCandidates(db: KernelDb, businessId: string) {
  return list<{ invoice_id: string; handymate: HandymateInvoiceSnapshot }>(db, 'list_shadow_candidates', { p_business_id: businessId, p_limit: 200 })
}
export async function openShadowRun(db: KernelDb, businessId: string, trigger: 'cron' | 'manual', version: number) {
  const result = await domainRpc(db, 'open_shadow_run', { p_business_id: businessId, p_trigger_type: trigger, p_comparison_version: version })
  if (typeof result.run_id !== 'string' || !['S1', 'S2'].includes(String(result.phase))) throw new TypeError('Invalid shadow run')
  return result as { run_id: string; phase: Exclude<KernelPhase, 'off'> }
}
export function closeShadowRun(db: KernelDb, businessId: string, runId: string, status: 'completed' | 'failed', counts: Record<string, unknown>) {
  return domainRpc(db, 'close_shadow_run', { p_business_id: businessId, p_run_id: runId, p_status: status, p_counts: counts })
}
export async function recordShadowSnapshot(db: KernelDb, businessId: string, invoiceId: string, externalId: string, snapshot: RawFortnoxShadowSnapshot) {
  const { data, error } = await db.rpc('record_shadow_snapshot', { p_business_id: businessId, p_provider: 'fortnox', p_object_type: 'invoice',
    p_external_id: externalId, p_invoice_id: invoiceId, p_fetch_status: snapshot.fetch_status, p_snapshot: snapshot.snapshot ?? null, p_error: snapshot.error ?? null })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string') throw new TypeError('Invalid shadow snapshot id')
  return data
}
export interface ShadowSighting { id: string; kind: string; severity: string; seen_count: number; confirmed: boolean; report: boolean }
export async function recordShadowComparison(db: KernelDb, businessId: string, runId: string, args: {
  level: number; objectType: 'invoice' | 'ledger' | 'aggregate' | 'report'; invoiceId?: string; snapshotId?: string;
  result: 'match' | 'divergent' | 'reference_missing' | 'unsupported'; handymate: unknown; differences: unknown[]
}) {
  return await domainRpc(db, 'record_shadow_comparison', { p_business_id: businessId, p_run_id: runId, p_level: args.level,
    p_object_type: args.objectType, p_invoice_id: args.invoiceId ?? null, p_snapshot_id: args.snapshotId ?? null,
    p_result: args.result, p_handymate: args.handymate, p_differences: args.differences }) as unknown as {
      comparison_id: string; divergences: ShadowSighting[]; closed: number
    }
}
export async function markShadowDivergencesReported(db: KernelDb, businessId: string, ids: string[]) {
  const { data, error } = await db.rpc('mark_shadow_divergences_reported', { p_business_id: businessId, p_ids: ids })
  if (error) throw new Error(error.message)
  return data
}
export function shadowStatus(db: KernelDb, businessId: string) { return domainRpc(db, 'financial_shadow_status', { p_business_id: businessId }) }
export function listShadowDivergences(db: KernelDb, businessId: string) {
  return list<Record<string, unknown>>(db, 'list_shadow_divergences', { p_business_id: businessId, p_status: 'open', p_limit: 100 })
}
export function resolveShadowDivergence(db: KernelDb, businessId: string, id: string, type: string, reason: string, actor: string, fixReference?: string, rootCauseCode?: string) {
  return domainRpc(db, 'resolve_shadow_divergence', { p_business_id: businessId, p_divergence_id: id, p_resolution_type: type,
    p_reason: reason, p_actor: actor, p_fix_reference: fixReference ?? null, p_root_cause_code: rootCauseCode ?? null })
}

import type { KernelDb } from './events/publish'
import { domainRpc } from './receivables/service'

export type KernelPhase = 'off' | 'S1' | 'S2'
export async function readPhase(db: KernelDb, businessId: string): Promise<KernelPhase> {
  const { data, error } = await db.rpc('financial_kernel_phase', { p_business_id: businessId })
  if (error) throw new Error(error.message)
  if (data !== 'off' && data !== 'S1' && data !== 'S2') throw new TypeError('Invalid kernel phase')
  return data
}
export function setPhase(db: KernelDb, businessId: string, phase: KernelPhase, actor: string, reason: string) {
  return domainRpc(db, 'set_financial_kernel_phase', { p_business_id: businessId, p_phase: phase, p_actor: actor, p_reason: reason })
}

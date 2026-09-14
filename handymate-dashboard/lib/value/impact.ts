import type { SupabaseClient } from '@supabase/supabase-js'
import { getManadsLedger } from './ledger'
import { getWeeklyValue } from '../weekly-value'
import { getVardekvitto, manadsfonster } from './vardekvitto'
import { usesKernelValue, readKernelWatermark } from './kernel-evidence'
export interface ImpactResponse {
  version: 1
  business_id: string
  checked_at: string
  period: string
  currency: 'SEK'
  money_source: 'kernel'
  money_method_version: 4
  through_seq: string
  ledger: NonNullable<Awaited<ReturnType<typeof getManadsLedger>>>
  weekly: Awaited<ReturnType<typeof getWeeklyValue>>
  receipt: NonNullable<Awaited<ReturnType<typeof getVardekvitto>>>
}
/** Presentation only. Cohort/monthly-event/rolling-week totals have distinct labels and are never added. */
export async function getImpact(
  db: SupabaseClient,
  businessId: string,
  period: string,
): Promise<ImpactResponse> {
  if (!manadsfonster(period)) throw new TypeError('invalid_impact_period')
  if (!(await usesKernelValue(db, businessId)))
    throw new Error('impact_kernel_not_enabled')
  const watermark = await readKernelWatermark(db, businessId)
  const [ledger, weekly, receipt] = await Promise.all([
    getManadsLedger(db, businessId, period, 3),
    getWeeklyValue(db, businessId, 7, { failOnReadError: true }),
    getVardekvitto(db, businessId, period, { failOnReadError: true }),
  ])
  if (!ledger || !receipt) throw new Error('impact_missing_underlying_result')
  if ((await readKernelWatermark(db, businessId)) !== watermark)
    throw new Error('impact_money_changed_during_read')
  return {
    version: 1,
    business_id: businessId,
    checked_at: new Date().toISOString(),
    period,
    currency: 'SEK',
    money_source: 'kernel',
    money_method_version: 4,
    through_seq: watermark,
    ledger,
    weekly,
    receipt,
  }
}

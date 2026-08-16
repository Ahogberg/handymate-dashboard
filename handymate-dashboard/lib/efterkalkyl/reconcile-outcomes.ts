/**
 * Idempotent Outcome Quality-reconciliation.
 *
 * Saknade och legacy-frusna utfall räknas om från kanoniska källor. En rad
 * märks aldrig V2 med en UPDATE: freezeProjectOutcome måste lyckas hela vägen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  OUTCOME_CALCULATION_VERSION,
  freezeProjectOutcome,
  type FreezeOutcomeFailureCode,
} from '@/lib/efterkalkyl/freeze-outcome'

export interface OutcomeReconciliationResult {
  scanned: number
  candidates: number
  reconciled: number
  failed: number
  remaining: number
  failures: Array<{ project_id: string; code: FreezeOutcomeFailureCode }>
}

export async function reconcileProjectOutcomes(
  supabase: SupabaseClient,
  businessId: string,
  options: { scanLimit?: number; reconcileLimit?: number } = {},
): Promise<OutcomeReconciliationResult> {
  const scanLimit = Math.min(Math.max(options.scanLimit ?? 300, 1), 500)
  const reconcileLimit = Math.min(Math.max(options.reconcileLimit ?? 20, 1), 100)

  const { data: projects, error: projectError } = await supabase
    .from('project')
    .select('project_id')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(scanLimit)
  if (projectError) throw new Error(`project-reconciliation misslyckades: ${projectError.message}`)

  const projectIds = (projects || []).map(row => String(row.project_id))
  if (projectIds.length === 0) {
    return { scanned: 0, candidates: 0, reconciled: 0, failed: 0, remaining: 0, failures: [] }
  }

  const { data: outcomes, error: outcomeError } = await supabase
    .from('project_outcome')
    .select('project_id, calculation_version')
    .eq('business_id', businessId)
    .in('project_id', projectIds)
  if (outcomeError) throw new Error(`project_outcome-reconciliation misslyckades: ${outcomeError.message}`)

  const versionByProject = new Map<string, number | null>(
    (outcomes || []).map(row => [String(row.project_id), row.calculation_version == null
      ? null
      : Number(row.calculation_version)]),
  )
  const candidates = projectIds.filter(projectId => (
    versionByProject.get(projectId) !== OUTCOME_CALCULATION_VERSION
  ))
  const selected = candidates.slice(0, reconcileLimit)
  const failures: OutcomeReconciliationResult['failures'] = []
  let reconciled = 0

  for (const projectId of selected) {
    const result = await freezeProjectOutcome(supabase, businessId, projectId, {
      reconciliation: true,
    })
    if (result.ok) reconciled += 1
    else failures.push({ project_id: projectId, code: result.code })
  }

  return {
    scanned: projectIds.length,
    candidates: candidates.length,
    reconciled,
    failed: failures.length,
    remaining: Math.max(candidates.length - selected.length, 0),
    failures,
  }
}

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
    .select('project_id, calculation_version, labor_cost_configured')
    .eq('business_id', businessId)
    .in('project_id', projectIds)
  if (outcomeError) throw new Error(`project_outcome-reconciliation misslyckades: ${outcomeError.message}`)

  interface OutcomeVersionRow {
    calculation_version: number | null
    labor_cost_configured: boolean | null
  }
  const outcomeByProject = new Map<string, OutcomeVersionRow>(
    (outcomes || []).map(row => [String(row.project_id), {
      calculation_version: row.calculation_version == null ? null : Number(row.calculation_version),
      labor_cost_configured: row.labor_cost_configured ?? null,
    }]),
  )

  // Läcka 2-täppning (2026-08-19, OperatingExperiment-fångstskydd): en V2-rad
  // kan vara "klar" i versionsmening men ändå frusen med
  // labor_cost_configured=false (learning_blockers innehåller
  // 'labor_cost_incomplete') om business_config.default_internal_hourly_cost
  // saknades vid stängningen — se lib/efterkalkyl/freeze-outcome.ts. Utan
  // detta extra kriterium läker den raden ALDRIG: versionskriteriet nedan ser
  // den redan som klar (calculation_version === OUTCOME_CALCULATION_VERSION)
  // och rör den aldrig igen, även efter att timkostnaden satts.
  //
  // Säkerhetsresonemang för att refrysa: freezeProjectOutcome läser HELA sin
  // källdata på nytt vid varje anrop (tidrapporter, fakturor, ÄTA, business_
  // config — se compute-economics.ts) — inget cachat delta. Projektet är
  // redan stängt, så tidrapporter/fakturor/ÄTA-rader ändras inte retroaktivt
  // av refrysningen, bara arbetskostnaden (som nu KAN beräknas) läggs på.
  // Upsert (onConflict: project_id) skriver hela raden på nytt, aldrig ett
  // delta ovanpå gamla värden — ingen dubbelräkning möjlig. Frysprincipen är
  // att utfallet ska spegla verkligheten, och verkligheten är nu att
  // kostnaden är känd, så en refrysning här är hederlig, inte en smygrevidering
  // av ett medvetet fruset fält.
  let hourlyCostNowConfigured = false
  {
    const { data: configRow, error: configError } = await supabase
      .from('business_config')
      .select('default_internal_hourly_cost')
      .eq('business_id', businessId)
      .maybeSingle()
    if (configError) throw new Error(`business_config-uppslag misslyckades: ${configError.message}`)
    hourlyCostNowConfigured = Number(configRow?.default_internal_hourly_cost ?? 0) > 0
  }

  const candidates = projectIds.filter(projectId => {
    const outcome = outcomeByProject.get(projectId)
    if (!outcome || outcome.calculation_version !== OUTCOME_CALCULATION_VERSION) return true
    if (hourlyCostNowConfigured && outcome.labor_cost_configured === false) return true
    return false
  })
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

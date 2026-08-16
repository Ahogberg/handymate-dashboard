import type { SupabaseClient } from '@supabase/supabase-js'
import { OUTCOME_CALCULATION_VERSION } from '@/lib/efterkalkyl/freeze-outcome'

export const BENCHMARK_POLICY = Object.freeze({
  consent_version: 'benchmark-readiness-v1',
  min_outcomes_per_business_job_type: 3,
  min_businesses_per_cohort: 5,
  min_outcomes_per_cohort: 30,
})

export type BenchmarkOwnDataStatus = 'empty' | 'building' | 'ready'

export interface BenchmarkOutcomeSignal {
  job_type: string | null
  calculation_version: number | null
  time_learning_eligible: boolean
  financial_learning_eligible: boolean
}
export interface BenchmarkOwnReadiness {
  status: BenchmarkOwnDataStatus
  qualified_outcomes: number
  time_outcomes: number
  financial_outcomes: number
  ready_job_types: number
  next_outcomes_needed: number
}

export interface BenchmarkReadinessSnapshot {
  available: boolean
  reason: string | null
  demo_tenant: boolean
  consent: {
    enabled: boolean
    version: string | null
    changed_at: string | null
  }
  own_data: BenchmarkOwnReadiness
  benchmark: {
    available: false
    state: 'collecting'
  }
  policy: typeof BENCHMARK_POLICY
}

/**
 * Ren readiness-kärna. Den räknar bara kvalitetsflaggor och jobbtyper för
 * ETT företag; inga belopp, kunder, projekt-id:n eller tvärtenantvärden behövs.
 */
export function buildBenchmarkOwnReadiness(
  rows: BenchmarkOutcomeSignal[],
): BenchmarkOwnReadiness {
  const qualified = rows.filter(row => (
    row.calculation_version === OUTCOME_CALCULATION_VERSION
    && (row.time_learning_eligible || row.financial_learning_eligible)
  ))
  const timeRows = qualified.filter(row => row.time_learning_eligible)
  const financialRows = qualified.filter(row => row.financial_learning_eligible)
  const perJobType = new Map<string, number>()

  for (const row of timeRows) {
    const jobType = row.job_type?.trim()
    if (!jobType) continue
    perJobType.set(jobType, (perJobType.get(jobType) || 0) + 1)
  }

  const counts = Array.from(perJobType.values())
  const readyJobTypes = counts.filter(
    count => count >= BENCHMARK_POLICY.min_outcomes_per_business_job_type,
  ).length
  const bestCount = counts.length > 0 ? Math.max(...counts) : 0
  const nextOutcomesNeeded = Math.max(
    0,
    BENCHMARK_POLICY.min_outcomes_per_business_job_type - bestCount,
  )

  return {
    status: qualified.length === 0 ? 'empty' : readyJobTypes > 0 ? 'ready' : 'building',
    qualified_outcomes: qualified.length,
    time_outcomes: timeRows.length,
    financial_outcomes: financialRows.length,
    ready_job_types: readyJobTypes,
    next_outcomes_needed: nextOutcomesNeeded,
  }
}

function emptySnapshot(reason: string): BenchmarkReadinessSnapshot {
  return {
    available: false,
    reason,
    demo_tenant: false,
    consent: { enabled: false, version: null, changed_at: null },
    own_data: buildBenchmarkOwnReadiness([]),
    benchmark: { available: false, state: 'collecting' },
    policy: BENCHMARK_POLICY,
  }
}

/** Tenantbunden läsgräns. V1 gör avsiktligt ingen global/cohort-fråga. */
export async function readBenchmarkReadiness(
  supabase: SupabaseClient,
  businessId: string,
): Promise<BenchmarkReadinessSnapshot> {
  const { data: config, error: configError } = await supabase
    .from('business_config')
    .select('benchmark_consent_enabled, benchmark_consent_version, benchmark_consent_changed_at, is_demo_tenant')
    .eq('business_id', businessId)
    .maybeSingle()

  if (configError) {
    console.error('[benchmark-readiness] samtyckesstatus kunde inte läsas:', configError)
    return emptySnapshot('Benchmark Readiness är inte aktiverad i databasen ännu.')
  }
  if (!config) return emptySnapshot('Företagets benchmarkstatus saknas.')

  const { data: outcomeRows, error: outcomeError } = await supabase
    .from('project_outcome')
    .select('job_type, calculation_version, time_learning_eligible, financial_learning_eligible')
    .eq('business_id', businessId)

  if (outcomeError) {
    console.error('[benchmark-readiness] outcome-readiness kunde inte läsas:', outcomeError)
    return {
      ...emptySnapshot('Kvalitetsgodkända projektutfall kunde inte läsas säkert.'),
      demo_tenant: config.is_demo_tenant === true,
      consent: {
        enabled: config.benchmark_consent_enabled === true,
        version: config.benchmark_consent_version || null,
        changed_at: config.benchmark_consent_changed_at || null,
      },
    }
  }

  return {
    available: true,
    reason: null,
    demo_tenant: config.is_demo_tenant === true,
    consent: {
      enabled: config.benchmark_consent_enabled === true,
      version: config.benchmark_consent_version || null,
      changed_at: config.benchmark_consent_changed_at || null,
    },
    own_data: buildBenchmarkOwnReadiness(
      (outcomeRows || []) as BenchmarkOutcomeSignal[],
    ),
    benchmark: { available: false, state: 'collecting' },
    policy: BENCHMARK_POLICY,
  }
}

/**
 * deal-cycle calculator (Fas 1a Dag 6, 2026-05-30).
 *
 * Per tasks/fas1-pattern-extraction-design.md Tier A.
 *
 * Pattern: hur lång tid tar det från deal-skapande till vunnen?
 *
 * Sample = en vunnen deal med closed_at IS NOT NULL inom 90d-window.
 * Min N preliminary: 10 vunna deals.
 *
 * Exclusion-rule (outlier-kind):
 *   - cycle_days < 1 → samma-dag testdata (Bee:s första vunna deal hade
 *     cycle=0, troligen manuell test). Exkluderas så genomsnittet inte
 *     förorenas. metadata loggar excluded_total + by_kind={outlier:N}.
 *
 * Beräkning på kept[]:
 *   avg_days, median_days, p25_days, p75_days, min_days, max_days
 *
 * Designval: split i ren funktion (computeDealCycle) + thin DB-wrapper
 * (calculateDealCycle). Samma mönster som approve-rate.
 *
 * SQL: JOIN pipeline_stage WHERE is_won. closed_at IS NOT NULL krävs
 * för cykel-beräkning. Pre-filter på created_at >= window.start.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { applyExclusions, summarizeExclusions, type ExclusionRule } from '../exclusions'
import { assessConfidence, getDataWindow } from '../sample-thresholds'
import type { DealCycleValue, DealCycleMetadata, CalculatorResult } from '../types'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

/**
 * Subset av deal-rad som deal-cycle behöver. DB-wrapper SELECT:ar
 * via JOIN på pipeline_stage för att hitta is_won=true.
 */
export interface DealCycleSample {
  id: string
  created_at: string
  closed_at: string
  cycle_days: number  // beräknad från closed_at - created_at
}

/**
 * Exclusion-rules för deal_cycle.
 *
 * Andreas-observation: Bee:s första vunna deal hade cycle=0 dagar
 * (skapad → markerad won samma dag), troligen testdata. Exkluderas
 * så de inte förorenar genomsnittet.
 *
 * Exporterad så cron-route (Dag 4) kan inkludera reason i audit-spår.
 */
export const DEAL_CYCLE_EXCLUSIONS: ExclusionRule<DealCycleSample>[] = [
  {
    predicate: d => d.cycle_days < 1,
    reason: 'cycle_under_1_day_likely_testdata',
    kind: 'outlier',  // data-anomali, inte strukturell
  },
]

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Percentile på sorterad numerisk array. Använder linjär interpolation
 * mellan närmaste rangerade värden. Returnerar null för tom array.
 *
 * Standardformel: rank = (p/100) * (n - 1).
 */
function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  if (sortedAsc.length === 1) return sortedAsc[0]
  const rank = (p / 100) * (sortedAsc.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sortedAsc[lower]
  const weight = rank - lower
  return sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

// ─────────────────────────────────────────────────────────────────
// Ren funktion — unit-testbar utan DB
// ─────────────────────────────────────────────────────────────────

/**
 * Beräkna deal_cycle-pattern från en samples-array av VUNNA deals.
 *
 * Caller (DB-wrapper) ansvarar för:
 *   - JOIN pipeline_stage + filter is_won=true
 *   - closed_at IS NOT NULL
 *   - created_at inom window
 *   - cycle_days = (closed_at - created_at) i dagar (kan vara floats < 1)
 *
 * Denna funktion exkluderar outliers via DEAL_CYCLE_EXCLUSIONS och
 * beräknar percentiler på kept[].
 */
export function computeDealCycle(
  samples: DealCycleSample[],
  dataWindowStart: string,
  dataWindowEnd: string,
  openDealsCount?: number,
): CalculatorResult {
  const exclusionResult = applyExclusions(samples, DEAL_CYCLE_EXCLUSIONS)
  const kept = exclusionResult.kept

  const cycleDays = kept.map(s => s.cycle_days).sort((a, b) => a - b)

  const value: DealCycleValue = {
    avg_days: average(cycleDays),
    median_days: percentile(cycleDays, 50),
    p25_days: percentile(cycleDays, 25),
    p75_days: percentile(cycleDays, 75),
    min_days: cycleDays.length > 0 ? cycleDays[0] : null,
    max_days: cycleDays.length > 0 ? cycleDays[cycleDays.length - 1] : null,
  }

  const metadata: DealCycleMetadata = {
    ...summarizeExclusions(exclusionResult),
    ...(openDealsCount !== undefined ? { open_deals_count: openDealsCount } : {}),
  }

  return {
    pattern_key: 'deal_cycle',
    value,
    sample_size: kept.length,
    data_window_start: dataWindowStart,
    data_window_end: dataWindowEnd,
    metadata,
  }
}

// ─────────────────────────────────────────────────────────────────
// DB-wrapper — thin
// ─────────────────────────────────────────────────────────────────

interface DealWithStage {
  id: string
  created_at: string
  closed_at: string | null
  pipeline_stage: {
    is_won: boolean | null
    is_lost: boolean | null
  } | null
}

/**
 * Hämta vunna deals för business inom 90d-window och beräkna deal_cycle.
 *
 * SQL: deal JOIN pipeline_stage. Bara vunna (is_won=true) med
 * closed_at IS NOT NULL kvalificerar som cycle-samples. Öppna/förlorade
 * deals räknas separat för open_deals_count-metadata.
 */
export async function calculateDealCycle(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<{
  result: CalculatorResult
  confidence: ReturnType<typeof assessConfidence>
}> {
  const window = getDataWindow('deal_cycle', now)

  const { data, error } = await supabase
    .from('deal')
    .select('id, created_at, closed_at, pipeline_stage:stage_id(is_won, is_lost)')
    .eq('business_id', businessId)
    .gte('created_at', window.start.toISOString())
    .lte('created_at', window.end.toISOString())

  if (error) {
    console.error('[calculateDealCycle] query error:', error)
    throw new Error(`deal_cycle query failed: ${error.message}`)
  }

  const allDeals = (data || []) as unknown as DealWithStage[]

  // Splittra: vunna med closed_at = samples, öppna = count för metadata
  const wonSamples: DealCycleSample[] = []
  let openDeals = 0
  for (const deal of allDeals) {
    const stage = Array.isArray(deal.pipeline_stage) ? deal.pipeline_stage[0] : deal.pipeline_stage
    if (stage?.is_won && deal.closed_at) {
      const cycleMs = new Date(deal.closed_at).getTime() - new Date(deal.created_at).getTime()
      const cycleDays = cycleMs / 86400000
      wonSamples.push({
        id: deal.id,
        created_at: deal.created_at,
        closed_at: deal.closed_at,
        cycle_days: cycleDays,
      })
    } else if (!stage?.is_won && !stage?.is_lost) {
      openDeals++
    }
  }

  const result = computeDealCycle(
    wonSamples,
    window.start.toISOString(),
    window.end.toISOString(),
    openDeals,
  )

  const confidence = assessConfidence(result.sample_size, 'deal_cycle')

  return { result, confidence }
}

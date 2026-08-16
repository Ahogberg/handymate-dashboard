/**
 * Motor 1: Lärande prissättning — Steg 2, delad kärna.
 *
 * Extraherad ur app/api/quotes/efterkalkyl-insikt/route.ts så att både
 * routen (QuoteNewEfterkalkylBanner) och Matte-verktyget
 * get_efterkalkyl_insight (app/api/agent/trigger/tool-router.ts) delar
 * EXAKT samma lazy-backfill + aggregeringslogik — ingen dubblett.
 *
 * Lazy backfill: completed-projekt med quote_id som saknar outcome-rad
 * fryses on-demand, max LAZY_BACKFILL_LIMIT per anrop. Fail-safe: om
 * backfill eller project_outcome-läsningen misslyckas (t.ex. v73-
 * migrationen inte körd än) degraderar vi till { count: 0, insufficient:
 * true } istället för att kasta.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { OUTCOME_CALCULATION_VERSION } from '@/lib/efterkalkyl/freeze-outcome'
import { reconcileProjectOutcomes } from '@/lib/efterkalkyl/reconcile-outcomes'

const MIN_SAMPLE_SIZE = 3

export interface EfterkalkylInsight {
  count: number
  financial_count?: number
  insufficient: boolean
  avg_hours_diff_pct?: number
  avg_amount_diff_pct?: number | null
  avg_margin_pct?: number | null
  sample_job_types?: string[]
}

export interface EfterkalkylInsightFilter {
  jobType?: string | null
  templateId?: string | null
}

/**
 * template_id vinner om båda skickas (samma prioritering som freeze-
 * outcome: mallen är den skarpaste grupperingsnyckeln, jobbtyp är
 * bredare/sekundär).
 */
export async function getEfterkalkylInsight(
  supabase: SupabaseClient,
  businessId: string,
  filter: EfterkalkylInsightFilter,
): Promise<EfterkalkylInsight> {
  const { jobType, templateId } = filter

  await reconcileForRead(supabase, businessId)

  let query = supabase
    .from('project_outcome')
    .select('job_type, template_id, hours_diff_pct, amount_diff_pct, realized_margin_pct, time_learning_eligible, financial_learning_eligible')
    .eq('business_id', businessId)
    .eq('calculation_version', OUTCOME_CALCULATION_VERSION)

  if (templateId) {
    query = query.eq('template_id', templateId)
  } else if (jobType) {
    query = query.eq('job_type', jobType)
  }

  const { data: rows, error } = await query

  if (error) {
    console.error('[efterkalkyl-insikt] läsning misslyckades, degraderar till insufficient:', error)
    return { count: 0, insufficient: true }
  }

  const qualityRows = (rows || []) as Array<{
    job_type: string | null
    template_id: string | null
    hours_diff_pct: number | null
    amount_diff_pct: number | null
    realized_margin_pct: number | null
    time_learning_eligible: boolean
    financial_learning_eligible: boolean
  }>
  const withHoursDiff = qualityRows.filter(row => (
    row.time_learning_eligible && row.hours_diff_pct != null
  ))
  const financialRows = qualityRows.filter(row => row.financial_learning_eligible)

  if (withHoursDiff.length < MIN_SAMPLE_SIZE) {
    return {
      count: withHoursDiff.length,
      financial_count: financialRows.length,
      insufficient: true,
    }
  }

  const avgHoursDiffPct = average(withHoursDiff.map((r) => r.hours_diff_pct as number))

  const amountRows = financialRows.filter((r) => r.amount_diff_pct != null)
  const avgAmountDiffPct =
    amountRows.length >= MIN_SAMPLE_SIZE
      ? average(amountRows.map((r) => r.amount_diff_pct as number))
      : null

  const marginRows = financialRows.filter((r) => r.realized_margin_pct != null)
  const avgMarginPct =
    marginRows.length >= MIN_SAMPLE_SIZE
      ? average(marginRows.map((r) => r.realized_margin_pct as number))
      : null

  const sampleJobTypes = Array.from(
    new Set(withHoursDiff.map((r) => r.job_type).filter((j): j is string => !!j)),
  )

  return {
    count: withHoursDiff.length,
    financial_count: financialRows.length,
    insufficient: false,
    avg_hours_diff_pct: round1(avgHoursDiffPct),
    avg_amount_diff_pct: avgAmountDiffPct != null ? round1(avgAmountDiffPct) : null,
    avg_margin_pct: avgMarginPct != null ? round1(avgMarginPct) : null,
    sample_job_types: sampleJobTypes,
  }
}

function average(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / nums.length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ─────────────────────────────────────────────────────────────────
// Per-jobbtyp-gruppering (Våg 2e, tasks/value-chain-plan.md)
//
// Daniels nattliga observations-pipeline (lib/agents/daniel/
// observation-prompt.ts) behöver efterkalkyl grupperad per jobbtyp
// ("badrummen drar 22% över offererad tid") istället för ett enda
// aggregat/filter som getEfterkalkylInsight ovan ger. ÅTERANVÄNDER
// samma lazy-backfill + MIN_SAMPLE_SIZE + average/round1-helpers —
// bara grupperingsdimensionen skiljer sig.
// ─────────────────────────────────────────────────────────────────

export interface JobTypeEfterkalkylInsight {
  job_type: string
  count: number
  financial_count: number
  avg_hours_diff_pct: number
  avg_amount_diff_pct: number | null
}

/**
 * Ren funktion (ingen I/O): grupperar frusna project_outcome-rader per
 * jobbtyp. Samma ärlighetsprincip som getEfterkalkylInsight — en jobbtyp
 * med färre än MIN_SAMPLE_SIZE (3) kvalificerade utfall (hours_diff_pct
 * != null) exkluderas HELT ur resultatet. Facit-testad separat (rena
 * indata → output, ingen mock av Supabase behövs).
 */
export function aggregateOutcomesByJobType(
  rows: Array<{
    job_type: string | null
    calculation_version: number | null
    time_learning_eligible: boolean
    financial_learning_eligible: boolean
    hours_diff_pct: number | null
    amount_diff_pct: number | null
  }>,
): JobTypeEfterkalkylInsight[] {
  const byType: Record<
    string,
    Array<{
      hours_diff_pct: number
      amount_diff_pct: number | null
      financial_learning_eligible: boolean
    }>
  > = {}

  for (const row of rows) {
    if (row.calculation_version !== OUTCOME_CALCULATION_VERSION) continue
    if (!row.time_learning_eligible || !row.job_type) continue
    if (row.hours_diff_pct == null) continue
    if (!byType[row.job_type]) byType[row.job_type] = []
    byType[row.job_type].push({
      hours_diff_pct: row.hours_diff_pct,
      amount_diff_pct: row.amount_diff_pct,
      financial_learning_eligible: row.financial_learning_eligible,
    })
  }

  const result: JobTypeEfterkalkylInsight[] = []
  for (const [jobType, entries] of Object.entries(byType)) {
    if (entries.length < MIN_SAMPLE_SIZE) continue // ärlighetsprincipen

    const amountEntries = entries.filter((e) => (
      e.financial_learning_eligible && e.amount_diff_pct != null
    ))
    result.push({
      job_type: jobType,
      count: entries.length,
      financial_count: amountEntries.length,
      avg_hours_diff_pct: round1(average(entries.map((e) => e.hours_diff_pct))),
      avg_amount_diff_pct:
        amountEntries.length >= MIN_SAMPLE_SIZE
          ? round1(average(amountEntries.map((e) => e.amount_diff_pct as number)))
          : null,
    })
  }

  // Störst avvikelse (absolutbelopp) först — mest actionable för Daniel.
  return result.sort(
    (a, b) => Math.abs(b.avg_hours_diff_pct) - Math.abs(a.avg_hours_diff_pct),
  )
}

/**
 * DB-wrapper: läser project_outcome (efter lazy backfill) och grupperar
 * per jobbtyp via aggregateOutcomesByJobType. Fail-safe: kastar aldrig,
 * degraderar till tom array (samma princip som getEfterkalkylInsight).
 */
export async function getEfterkalkylInsightsByJobType(
  supabase: SupabaseClient,
  businessId: string,
): Promise<JobTypeEfterkalkylInsight[]> {
  await reconcileForRead(supabase, businessId)

  const { data: rows, error } = await supabase
    .from('project_outcome')
    .select('job_type, calculation_version, time_learning_eligible, financial_learning_eligible, hours_diff_pct, amount_diff_pct')
    .eq('business_id', businessId)
    .eq('calculation_version', OUTCOME_CALCULATION_VERSION)

  if (error) {
    console.error(
      '[efterkalkyl-insikt/by-job-type] läsning misslyckades, degraderar till tom lista:',
      error,
    )
    return []
  }

  return aggregateOutcomesByJobType(
    (rows || []) as Array<{
      job_type: string | null
      calculation_version: number | null
      time_learning_eligible: boolean
      financial_learning_eligible: boolean
      hours_diff_pct: number | null
      amount_diff_pct: number | null
    }>,
  )
}

async function reconcileForRead(supabase: SupabaseClient, businessId: string): Promise<void> {
  try {
    await reconcileProjectOutcomes(supabase, businessId, { reconcileLimit: 20 })
  } catch (err) {
    console.error('[efterkalkyl-insikt] quality-reconciliation misslyckades:', err)
  }
}

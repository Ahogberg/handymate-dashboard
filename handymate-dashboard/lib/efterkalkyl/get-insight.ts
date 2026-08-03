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
import { freezeProjectOutcome } from '@/lib/efterkalkyl/freeze-outcome'

const LAZY_BACKFILL_LIMIT = 20
const MIN_SAMPLE_SIZE = 3

export interface EfterkalkylInsight {
  count: number
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

  await lazyBackfillOutcomes(supabase, businessId)

  let query = supabase
    .from('project_outcome')
    .select('job_type, template_id, hours_diff_pct, amount_diff_pct, margin_pct')
    .eq('business_id', businessId)

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

  const withHoursDiff = (rows || []).filter(
    (r: { hours_diff_pct: number | null }) => r.hours_diff_pct != null,
  ) as Array<{
    job_type: string | null
    template_id: string | null
    hours_diff_pct: number | null
    amount_diff_pct: number | null
    margin_pct: number | null
  }>

  if (withHoursDiff.length < MIN_SAMPLE_SIZE) {
    return { count: withHoursDiff.length, insufficient: true }
  }

  const avgHoursDiffPct = average(withHoursDiff.map((r) => r.hours_diff_pct as number))

  const amountRows = withHoursDiff.filter((r) => r.amount_diff_pct != null)
  const avgAmountDiffPct =
    amountRows.length > 0 ? average(amountRows.map((r) => r.amount_diff_pct as number)) : null

  const marginRows = withHoursDiff.filter((r) => r.margin_pct != null)
  const avgMarginPct =
    marginRows.length > 0 ? average(marginRows.map((r) => r.margin_pct as number)) : null

  const sampleJobTypes = Array.from(
    new Set(withHoursDiff.map((r) => r.job_type).filter((j): j is string => !!j)),
  )

  return {
    count: withHoursDiff.length,
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
    hours_diff_pct: number | null
    amount_diff_pct: number | null
  }>,
): JobTypeEfterkalkylInsight[] {
  const byType: Record<
    string,
    Array<{ hours_diff_pct: number; amount_diff_pct: number | null }>
  > = {}

  for (const row of rows) {
    if (!row.job_type) continue
    if (row.hours_diff_pct == null) continue
    if (!byType[row.job_type]) byType[row.job_type] = []
    byType[row.job_type].push({
      hours_diff_pct: row.hours_diff_pct,
      amount_diff_pct: row.amount_diff_pct,
    })
  }

  const result: JobTypeEfterkalkylInsight[] = []
  for (const [jobType, entries] of Object.entries(byType)) {
    if (entries.length < MIN_SAMPLE_SIZE) continue // ärlighetsprincipen

    const amountEntries = entries.filter((e) => e.amount_diff_pct != null)
    result.push({
      job_type: jobType,
      count: entries.length,
      avg_hours_diff_pct: round1(average(entries.map((e) => e.hours_diff_pct))),
      avg_amount_diff_pct:
        amountEntries.length > 0
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
  await lazyBackfillOutcomes(supabase, businessId)

  const { data: rows, error } = await supabase
    .from('project_outcome')
    .select('job_type, hours_diff_pct, amount_diff_pct')
    .eq('business_id', businessId)

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
      hours_diff_pct: number | null
      amount_diff_pct: number | null
    }>,
  )
}

async function lazyBackfillOutcomes(supabase: SupabaseClient, businessId: string): Promise<void> {
  try {
    const { data: candidates, error: candErr } = await supabase
      .from('project')
      .select('project_id')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .not('quote_id', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(300)

    if (candErr || !candidates || candidates.length === 0) return

    const candidateIds = candidates.map((c: { project_id: string }) => c.project_id)

    const { data: existing } = await supabase
      .from('project_outcome')
      .select('project_id')
      .eq('business_id', businessId)
      .in('project_id', candidateIds)

    const existingIds = new Set((existing || []).map((e: { project_id: string }) => e.project_id))
    const missing = candidateIds.filter((id: string) => !existingIds.has(id)).slice(0, LAZY_BACKFILL_LIMIT)

    for (const projectId of missing) {
      await freezeProjectOutcome(supabase, businessId, projectId)
    }
  } catch (err) {
    console.error('[efterkalkyl-insikt] lazy backfill fel (fail-safe, ignoreras):', err)
  }
}

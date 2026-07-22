import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { freezeProjectOutcome } from '@/lib/efterkalkyl/freeze-outcome'

/**
 * GET /api/quotes/efterkalkyl-insikt
 *
 * Motor 1 (Lärande prissättning) — steg 2. Läser project_outcome för
 * businessen, grupperat på template_id (primär) eller job_type (sekundär),
 * och returnerar snittdiffar som driver QuoteNewEfterkalkylBanner i
 * offertflödet.
 *
 * Query-params: template_id och/eller job_type. template_id vinner om
 * båda skickas (samma prioritering som freeze-outcome: mallen är den
 * skarpaste grupperingsnyckeln, jobbtyp är bredare/sekundär).
 *
 * Lazy backfill (punkt 1.4 i specen): completed-projekt med quote_id som
 * saknar outcome-rad fryses on-demand här, max 20 per anrop — ingen
 * separat cron/backfill-knapp behövs. Fail-safe: om backfill eller
 * project_outcome-läsningen misslyckas (t.ex. v73-migrationen inte körd
 * än) degraderar vi till { count: 0, insufficient: true } istället för 500.
 */

const LAZY_BACKFILL_LIMIT = 20
const MIN_SAMPLE_SIZE = 3

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const jobType = searchParams.get('job_type')
    const templateId = searchParams.get('template_id')

    if (!jobType && !templateId) {
      return NextResponse.json({ error: 'job_type eller template_id krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Lazy backfill innan vi läser — täcker in completed-projekt som
    // stängdes innan Motor 1 fanns, eller innan v73-migrationen kördes.
    await lazyBackfillOutcomes(supabase, business.business_id)

    let query = supabase
      .from('project_outcome')
      .select('job_type, template_id, hours_diff_pct, amount_diff_pct, margin_pct')
      .eq('business_id', business.business_id)

    if (templateId) {
      query = query.eq('template_id', templateId)
    } else if (jobType) {
      query = query.eq('job_type', jobType)
    }

    const { data: rows, error } = await query

    if (error) {
      console.error('[efterkalkyl-insikt] läsning misslyckades, degraderar till insufficient:', error)
      return NextResponse.json({ count: 0, insufficient: true })
    }

    // Kräv hours_diff_pct != null — det är den primära signalen bannern
    // bygger på. amount/margin är kompletterande och kan saknas oberoende.
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
      return NextResponse.json({ count: withHoursDiff.length, insufficient: true })
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

    return NextResponse.json({
      count: withHoursDiff.length,
      avg_hours_diff_pct: round1(avgHoursDiffPct),
      avg_amount_diff_pct: avgAmountDiffPct != null ? round1(avgAmountDiffPct) : null,
      avg_margin_pct: avgMarginPct != null ? round1(avgMarginPct) : null,
      sample_job_types: sampleJobTypes,
    })
  } catch (error: any) {
    console.error('[efterkalkyl-insikt] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function average(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / nums.length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Lazy backfill: completed-projekt med quote_id men utan project_outcome-
 * rad → frys on-demand. Max LAZY_BACKFILL_LIMIT per anrop så en business
 * med stor historik inte gör detta anropet tungt. Nyaste projekten
 * prioriteras (mest relevanta för dagens offertflöde).
 *
 * Fail-safe: fångar allt — om project_outcome-tabellen inte finns än gör
 * freezeProjectOutcome (som redan är fail-safe) ingenting skadligt, och om
 * candidate-queryn själv failar avbryts backfillen tyst.
 */
async function lazyBackfillOutcomes(supabase: any, businessId: string): Promise<void> {
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

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { genereraNextBestAction } from '@/lib/jarvis/next-best-action'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/next-best-action
 * Next Best Action Engine — en rangordnad daglig rekommendation per
 * aktivt företag. Körs kl 07:00 UTC via vercel.json, EFTER
 * evaluate-thresholds (06:00) och missed-revenue (06:40) så samma dags
 * profitability_warning/missad_intakt-kort hinns med — 05:30-slotet
 * (morning-brief) hade systematiskt missat dem.
 *
 * Samma per-företags try/catch-mönster som Måndagskortets loop i
 * app/api/cron/morning-brief/route.ts — ett företags fel stoppar aldrig
 * de andra.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id')
    .eq('subscription_status', 'active')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts = {
    processed: 0,
    inserted: 0,
    duplicate: 0,
    skipped_too_few_candidates: 0,
    skipped_no_principles: 0,
    skipped_model_failed: 0,
    errors: 0,
  }

  for (const biz of businesses || []) {
    counts.processed++
    try {
      const result = await genereraNextBestAction(supabase, biz.business_id)
      counts[result.status]++
    } catch (err) {
      counts.errors++
      console.error('[cron/next-best-action] misslyckades för', biz.business_id, err)
    }
  }

  return NextResponse.json(counts)
}

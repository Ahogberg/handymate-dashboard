/**
 * GET /api/cron/patterns
 *
 * Fas 1a Dag 4 (2026-05-30). Vercel cron — körs dagligen 05:00 UTC
 * (lägg till entry i vercel.json Dag 5).
 *
 * Itererar businesses (samma guards som agent-observation-cron):
 *   - is_active=true (Steg 2 dött/test-konto-filter)
 *   - NOT agents_globally_paused (Steg 7 kill-switch — om hantverkaren
 *     pausat sina agenter har de troligen även pausat pattern-extraktion)
 *
 * Per business:
 *   - runPatternsForBusiness → kallar Tier A-calculators, UPSERT:ar
 *   - Try/catch så en businesses fail kraschar inte de andra
 *
 * Ingen cost-cap-check här (skiljt från agent-observation-cron) — pattern-
 * extraction är ren SQL utan Claude-anrop. Cost-tracking via duration_ms
 * per business för skalbarhetsanalys.
 *
 * Auth: Bearer CRON_SECRET (samma som övriga cron-routes).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { runPatternsForBusiness } from '@/lib/patterns/run-patterns'

export const dynamic = 'force-dynamic'

interface BusinessResult {
  business_id: string
  business_name?: string | null
  skipped?: 'agents_globally_paused' | 'error'
  patterns_updated?: string[]
  errors?: Array<{ pattern: string; error: string }>
  duration_ms?: number
  error?: string
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: businesses, error: bizError } = await supabase
    .from('business_config')
    .select('business_id, business_name, agents_globally_paused')
    .eq('is_active', true)

  if (bizError) {
    console.error('[cron/patterns] business_config error:', bizError)
    return NextResponse.json(
      { error: bizError.message, stage: 'business_config' },
      { status: 500 },
    )
  }

  const results: BusinessResult[] = []
  let totalPatternsUpdated = 0
  const allErrors: Array<{ business_id: string; pattern: string; error: string }> = []

  for (const biz of (businesses || []) as Array<{
    business_id: string
    business_name: string | null
    agents_globally_paused: boolean | null
  }>) {
    // Kill-switch — om hantverkaren pausat agenterna pausar vi även pattern
    if (biz.agents_globally_paused === true) {
      console.log('[cron/patterns] skip — agents_globally_paused', { business_id: biz.business_id })
      results.push({
        business_id: biz.business_id,
        business_name: biz.business_name,
        skipped: 'agents_globally_paused',
      })
      continue
    }

    try {
      const result = await runPatternsForBusiness(supabase, biz.business_id)
      results.push({
        business_id: biz.business_id,
        business_name: biz.business_name,
        patterns_updated: result.patterns_updated,
        errors: result.errors.length > 0 ? result.errors : undefined,
        duration_ms: result.duration_ms,
      })
      totalPatternsUpdated += result.patterns_updated.length
      for (const e of result.errors) {
        allErrors.push({ business_id: biz.business_id, pattern: e.pattern, error: e.error })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[cron/patterns] business failed:', { business_id: biz.business_id, error: msg })
      results.push({
        business_id: biz.business_id,
        business_name: biz.business_name,
        skipped: 'error',
        error: msg,
      })
      allErrors.push({ business_id: biz.business_id, pattern: '*', error: msg })
    }
  }

  return NextResponse.json({
    ok: true,
    processed_businesses: results.length,
    patterns_updated: totalPatternsUpdated,
    errors: allErrors,
    results,
  })
}

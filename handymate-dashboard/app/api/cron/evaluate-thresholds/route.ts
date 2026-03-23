import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { evaluateThresholds, executeCronRules } from '@/lib/automation-engine'
import { checkProfitabilityWarnings } from '@/lib/profitability'

/**
 * GET /api/cron/evaluate-thresholds
 * Daglig cron (04:00): kör threshold- och cron-regler för alla företag.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  // Fetch all businesses
  const { data: businesses, error: bizErr } = await supabase
    .from('business_config')
    .select('business_id')

  if (bizErr || !businesses) {
    console.error('[evaluate-thresholds] Failed to fetch businesses:', bizErr)
    return NextResponse.json({ error: bizErr?.message }, { status: 500 })
  }

  const results: Array<{
    businessId: string
    thresholds: { evaluated: number; triggered: number; errors: number }
    cron: { executed: number; errors: number }
  }> = []

  for (const biz of businesses) {
    try {
      const [thresholdResult, cronResult] = await Promise.all([
        evaluateThresholds(supabase, biz.business_id),
        executeCronRules(supabase, biz.business_id),
      ])

      // Karin: lönsamhetsvarningar
      await checkProfitabilityWarnings(biz.business_id).catch((e) =>
        console.error(`[profitability] Warning check failed for ${biz.business_id}:`, e)
      )

      results.push({
        businessId: biz.business_id,
        thresholds: thresholdResult,
        cron: cronResult,
      })
    } catch (err) {
      console.error(`[evaluate-thresholds] Error for business ${biz.business_id}:`, err)
      results.push({
        businessId: biz.business_id,
        thresholds: { evaluated: 0, triggered: 0, errors: 1 },
        cron: { executed: 0, errors: 1 },
      })
    }
  }

  const totalTriggered = results.reduce((sum, r) => sum + r.thresholds.triggered + r.cron.executed, 0)
  const totalErrors = results.reduce((sum, r) => sum + r.thresholds.errors + r.cron.errors, 0)

  console.log(`[evaluate-thresholds] Done. Triggered: ${totalTriggered}, Errors: ${totalErrors}`)

  return NextResponse.json({
    success: true,
    total_triggered: totalTriggered,
    total_errors: totalErrors,
    businesses: results,
  })
}

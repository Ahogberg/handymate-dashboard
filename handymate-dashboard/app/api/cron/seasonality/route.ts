import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const MONTH_NAMES: Record<number, string> = {
  1: 'januari', 2: 'februari', 3: 'mars', 4: 'april',
  5: 'maj', 6: 'juni', 7: 'juli', 8: 'augusti',
  9: 'september', 10: 'oktober', 11: 'november', 12: 'december',
}

/**
 * GET /api/cron/seasonality — Veckovis analys + proaktiv trigger (6 veckor framåt)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  // 6 veckor framåt
  const sixWeeksOut = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000)
  const lookaheadMonth = sixWeeksOut.getMonth() + 1

  const { data: businesses } = await supabase
    .from('business_config')
    .select('business_id, branch')
    .not('branch', 'is', null)

  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  let analyzed = 0
  let generated = 0
  let proactiveTriggered = 0
  const errors: string[] = []

  for (const biz of businesses) {
    try {
      // 1. Analysera historik
      const { analyzeSeasonality } = await import('@/lib/seasonality/analyzer')
      const insights = await analyzeSeasonality(biz.business_id)
      analyzed++

      // 2. Generera kampanjförslag för aktuell månad
      const { generateSeasonalCampaign } = await import('@/lib/seasonality/campaign-generator')
      const result = await generateSeasonalCampaign(
        biz.business_id,
        biz.branch || '',
        currentMonth,
        currentYear
      )
      if (result.generated) generated++

      // 3. Proaktiv trigger: om 6 veckor framåt = svag månad
      if (insights) {
        const lookaheadInsight = insights.find(i => i.month === lookaheadMonth)
        if (lookaheadInsight?.is_slow_month) {
          const { data: existing } = await supabase
            .from('pending_approvals')
            .select('id')
            .eq('business_id', biz.business_id)
            .eq('approval_type', 'seasonal_campaign')
            .gte('created_at', `${currentYear}-01-01`)
            .ilike('title', `%${MONTH_NAMES[lookaheadMonth]}%`)
            .maybeSingle()

          if (!existing) {
            const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
            const monthName = MONTH_NAMES[lookaheadMonth]
            const peakList = insights.filter(i => i.is_peak_month).map(i => MONTH_NAMES[i.month]).join(', ')
            const slowList = insights.filter(i => i.is_slow_month).map(i => MONTH_NAMES[i.month]).join(', ')

            await supabase.from('pending_approvals').insert({
              id: approvalId,
              business_id: biz.business_id,
              approval_type: 'seasonal_campaign',
              title: `Säsongsvarning: ${monthName} brukar vara svag`,
              description: `${monthName} är historiskt en av dina svagaste månader. Vill du starta en reaktiveringskampanj till gamla kunder?`,
              risk_level: 'medium',
              status: 'pending',
              payload: {
                type: 'proactive_seasonal',
                lookahead_month: lookaheadMonth,
                month_name: monthName,
                slow_months: slowList,
                peak_months: peakList,
                avg_revenue: lookaheadInsight.avg_revenue,
                branch: biz.branch,
              },
              expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            })

            // Logga i automation_logs
            await supabase.from('v3_automation_logs').insert({
              business_id: biz.business_id,
              rule_name: 'seasonality_proactive',
              trigger_type: 'cron',
              action_type: 'create_approval',
              status: 'success',
              context: { lookahead_month: lookaheadMonth, month_name: monthName },
              result: { approval_id: approvalId },
            })

            proactiveTriggered++
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown'
      errors.push(`${biz.business_id}: ${msg}`)
    }
  }

  return NextResponse.json({
    success: true,
    processed: businesses.length,
    analyzed,
    campaigns_generated: generated,
    proactive_triggered: proactiveTriggered,
    errors: errors.length > 0 ? errors : undefined,
  })
}

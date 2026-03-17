import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/seasonality — Veckovis analys + kampanjgenerering
 * Körs måndag 08:00 UTC via Vercel Cron.
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

  // Hämta aktiva företag med branch satt
  const { data: businesses } = await supabase
    .from('business_config')
    .select('business_id, branch')
    .not('branch', 'is', null)

  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  let analyzed = 0
  let generated = 0
  const errors: string[] = []

  for (const biz of businesses) {
    try {
      // Analysera historik
      const { analyzeSeasonality } = await import('@/lib/seasonality/analyzer')
      await analyzeSeasonality(biz.business_id)
      analyzed++

      // Generera kampanjförslag för aktuell månad
      const { generateSeasonalCampaign } = await import('@/lib/seasonality/campaign-generator')
      const result = await generateSeasonalCampaign(
        biz.business_id,
        biz.branch || '',
        currentMonth,
        currentYear
      )
      if (result.generated) generated++

      // 500ms delay mellan företag för att undvika API rate limits
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
    errors: errors.length > 0 ? errors : undefined,
  })
}

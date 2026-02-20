import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkFeatureAccess } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

interface DealRow {
  id: string
  created_at: string
  first_response_at: string | null
  response_time_seconds: number | null
  stage_id: string
}

interface StageRow {
  id: string
  is_won: boolean
  is_lost: boolean
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const featureCheck = checkFeatureAccess(business, 'lead_intelligence')
    if (!featureCheck.allowed) {
      return NextResponse.json({ error: featureCheck.error, feature: featureCheck.feature, required_plan: featureCheck.required_plan }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const period = request.nextUrl.searchParams.get('period') || '30d'

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data: deals } = await supabase
      .from('deal')
      .select('id, created_at, first_response_at, response_time_seconds, stage_id')
      .eq('business_id', business.business_id)
      .gte('created_at', since.toISOString())
      .not('first_response_at', 'is', null)

    const { data: stages } = await supabase
      .from('pipeline_stage')
      .select('id, is_won, is_lost')
      .eq('business_id', business.business_id)

    const wonIds = new Set((stages as StageRow[] || []).filter((s: StageRow) => s.is_won).map((s: StageRow) => s.id))

    const allDeals = (deals as DealRow[] || [])
    const responseTimes = allDeals
      .map((d: DealRow) => d.response_time_seconds || 0)
      .filter((t: number) => t > 0)
      .sort((a: number, b: number) => a - b)

    const avg = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
      : 0
    const median = responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length / 2)]
      : 0

    const dist = { under_1_min: 0, '1_to_15_min': 0, '15_to_60_min': 0, '1_to_4_hours': 0, over_4_hours: 0 }
    const winBySpeed: Record<string, { won: number; total: number }> = {
      under_1_min: { won: 0, total: 0 },
      '1_to_15_min': { won: 0, total: 0 },
      '15_to_60_min': { won: 0, total: 0 },
      '1_to_4_hours': { won: 0, total: 0 },
      over_4_hours: { won: 0, total: 0 },
    }

    let autoCount = 0
    let manualCount = 0

    for (const d of allDeals) {
      const secs = d.response_time_seconds || 0
      const bucket = secs < 60 ? 'under_1_min'
        : secs < 900 ? '1_to_15_min'
        : secs < 3600 ? '15_to_60_min'
        : secs < 14400 ? '1_to_4_hours'
        : 'over_4_hours'

      dist[bucket as keyof typeof dist]++
      winBySpeed[bucket].total++
      if (wonIds.has(d.stage_id)) winBySpeed[bucket].won++
      if (secs < 60) autoCount++; else manualCount++
    }

    const winRateBySpeed: Record<string, number> = {}
    for (const [k, v] of Object.entries(winBySpeed)) {
      winRateBySpeed[k] = v.total > 0 ? Math.round((v.won / v.total) * 100) : 0
    }

    // Weekly trend
    const trend: { week: string; avg_seconds: number }[] = []
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - (w * 7 + 7))
      const weekEnd = new Date()
      weekEnd.setDate(weekEnd.getDate() - w * 7)

      const weekDeals = allDeals.filter((d: DealRow) => {
        const created = new Date(d.created_at)
        return created >= weekStart && created < weekEnd
      })

      const times = weekDeals.map((d: DealRow) => d.response_time_seconds || 0).filter((t: number) => t > 0)
      const weekAvg = times.length > 0 ? Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length) : 0

      const yearWeek = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / 604800000)).padStart(2, '0')}`
      trend.push({ week: yearWeek, avg_seconds: weekAvg })
    }

    return NextResponse.json({
      avg_response_seconds: avg,
      median_response_seconds: median,
      auto_response_count: autoCount,
      manual_response_count: manualCount,
      total_leads: allDeals.length,
      response_distribution: dist,
      win_rate_by_speed: winRateBySpeed,
      industry_avg_seconds: 14400,
      trend: trend.filter(t => t.avg_seconds > 0),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

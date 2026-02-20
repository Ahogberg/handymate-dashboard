import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkFeatureAccess } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

interface DealRow {
  id: string
  stage_id: string
  value: number | null
  created_at: string
  updated_at: string
  source: string | null
  loss_reason: string | null
  loss_reason_detail: string | null
  won_value: number | null
  lost_value: number | null
  lead_source_platform: string | null
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
    const period = request.nextUrl.searchParams.get('period') || '90d'

    const days = period === '30d' ? 30 : period === '12m' ? 365 : 90
    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data: stages } = await supabase
      .from('pipeline_stage')
      .select('id, is_won, is_lost')
      .eq('business_id', business.business_id)

    const wonIds = new Set((stages as StageRow[] || []).filter((s: StageRow) => s.is_won).map((s: StageRow) => s.id))
    const lostIds = new Set((stages as StageRow[] || []).filter((s: StageRow) => s.is_lost).map((s: StageRow) => s.id))

    const { data: deals } = await supabase
      .from('deal')
      .select('id, stage_id, value, created_at, updated_at, source, loss_reason, loss_reason_detail, won_value, lost_value, lead_source_platform')
      .eq('business_id', business.business_id)
      .gte('created_at', since.toISOString())

    const allDeals = (deals as DealRow[] || [])
    const wonDeals = allDeals.filter((d: DealRow) => wonIds.has(d.stage_id))
    const lostDeals = allDeals.filter((d: DealRow) => lostIds.has(d.stage_id))
    const activeDeals = allDeals.filter((d: DealRow) => !wonIds.has(d.stage_id) && !lostIds.has(d.stage_id))

    const closedDeals = wonDeals.length + lostDeals.length
    const winRate = closedDeals > 0 ? Math.round((wonDeals.length / closedDeals) * 100) : 0

    const wonValue = wonDeals.reduce((sum: number, d: DealRow) => sum + (d.won_value || d.value || 0), 0)
    const lostValue = lostDeals.reduce((sum: number, d: DealRow) => sum + (d.lost_value || d.value || 0), 0)

    const avgWonSize = wonDeals.length > 0 ? Math.round(wonValue / wonDeals.length) : 0
    const avgLostSize = lostDeals.length > 0 ? Math.round(lostValue / lostDeals.length) : 0

    // Avg days to win/loss
    const calcAvgDays = (dealList: DealRow[]): number => {
      if (dealList.length === 0) return 0
      const totalDays = dealList.reduce((sum: number, d: DealRow) => {
        const created = new Date(d.created_at)
        const updated = new Date(d.updated_at)
        return sum + Math.max(1, Math.round((updated.getTime() - created.getTime()) / 86400000))
      }, 0)
      return Math.round(totalDays / dealList.length)
    }

    // Loss reasons
    const reasonMap = new Map<string, { count: number; value: number }>()
    for (const d of lostDeals) {
      const reason = d.loss_reason || 'Okänd'
      const entry = reasonMap.get(reason) || { count: 0, value: 0 }
      entry.count++
      entry.value += d.lost_value || d.value || 0
      reasonMap.set(reason, entry)
    }
    const lossReasons = Array.from(reasonMap.entries())
      .map(([reason, data]) => ({ reason, ...data }))
      .sort((a, b) => b.count - a.count)

    // Win rate by source
    const sourceMap = new Map<string, { leads: number; won: number }>()
    for (const d of allDeals) {
      const source = d.lead_source_platform || d.source || 'Direkt'
      const entry = sourceMap.get(source) || { leads: 0, won: 0 }
      entry.leads++
      if (wonIds.has(d.stage_id)) entry.won++
      sourceMap.set(source, entry)
    }
    const winRateBySource = Array.from(sourceMap.entries())
      .map(([source, data]) => ({ source, ...data, rate: data.leads > 0 ? Math.round((data.won / data.leads) * 100) : 0 }))
      .sort((a, b) => b.leads - a.leads)

    // Monthly trend
    const monthMap = new Map<string, { won: number; lost: number }>()
    for (const d of allDeals) {
      const month = d.created_at.substring(0, 7)
      const entry = monthMap.get(month) || { won: 0, lost: 0 }
      if (wonIds.has(d.stage_id)) entry.won++
      if (lostIds.has(d.stage_id)) entry.lost++
      monthMap.set(month, entry)
    }
    const monthlyTrend = Array.from(monthMap.entries())
      .map(([month, data]) => ({
        month,
        won: data.won,
        lost: data.lost,
        rate: (data.won + data.lost) > 0 ? Math.round((data.won / (data.won + data.lost)) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    return NextResponse.json({
      period,
      total_deals: allDeals.length,
      won: wonDeals.length,
      lost: lostDeals.length,
      active: activeDeals.length,
      win_rate: winRate,
      won_value: wonValue,
      lost_value: lostValue,
      avg_deal_size_won: avgWonSize,
      avg_deal_size_lost: avgLostSize,
      avg_days_to_win: calcAvgDays(wonDeals),
      avg_days_to_loss: calcAvgDays(lostDeals),
      loss_reasons: lossReasons,
      win_rate_by_source: winRateBySource,
      monthly_trend: monthlyTrend,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

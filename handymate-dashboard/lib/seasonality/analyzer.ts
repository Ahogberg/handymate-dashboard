/**
 * Analyserar fakturahistorik och identifierar låg-/högsäsonger.
 */

import { getServerSupabase } from '@/lib/supabase'

export interface MonthInsight {
  month: number
  avg_revenue: number
  avg_job_count: number
  is_slow_month: boolean
  is_peak_month: boolean
}

/**
 * Analysera 24 månaders fakturahistorik per månad.
 * Kräver minst 10 fakturor. Upsert:ar till seasonality_insights.
 */
export async function analyzeSeasonality(businessId: string): Promise<MonthInsight[] | null> {
  const supabase = getServerSupabase()

  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 2)

  const { data: invoices, error } = await supabase
    .from('invoice')
    .select('total, created_at')
    .eq('business_id', businessId)
    .in('status', ['sent', 'paid'])
    .gte('created_at', cutoff.toISOString())

  if (error || !invoices || invoices.length < 10) return null

  // Aggregera per månad
  const monthlyData: Record<number, { revenue: number; count: number; years: Set<number> }> = {}
  for (let m = 1; m <= 12; m++) {
    monthlyData[m] = { revenue: 0, count: 0, years: new Set() }
  }

  for (const inv of invoices) {
    const d = new Date(inv.created_at)
    const month = d.getMonth() + 1
    monthlyData[month].revenue += Number(inv.total) || 0
    monthlyData[month].count++
    monthlyData[month].years.add(d.getFullYear())
  }

  const monthlyAvgs = Object.entries(monthlyData).map(([m, data]) => ({
    month: parseInt(m),
    avg_revenue: Math.round((data.revenue / Math.max(data.years.size, 1)) * 100) / 100,
    avg_job_count: Math.round(data.count / Math.max(data.years.size, 1)),
  }))

  const totalAvg = monthlyAvgs.reduce((s, m) => s + m.avg_revenue, 0) / 12

  const insights: MonthInsight[] = monthlyAvgs.map(m => ({
    ...m,
    is_slow_month: totalAvg > 0 && m.avg_revenue < totalAvg * 0.7,
    is_peak_month: totalAvg > 0 && m.avg_revenue > totalAvg * 1.3,
  }))

  // Upsert till DB
  for (const insight of insights) {
    await supabase.from('seasonality_insights').upsert({
      business_id: businessId,
      month: insight.month,
      avg_revenue: insight.avg_revenue,
      avg_job_count: insight.avg_job_count,
      is_slow_month: insight.is_slow_month,
      is_peak_month: insight.is_peak_month,
      last_analyzed_at: new Date().toISOString(),
    }, { onConflict: 'business_id,month' })
  }

  return insights
}

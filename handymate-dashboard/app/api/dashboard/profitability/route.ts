import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/dashboard/profitability - Topp 5 aktiva projekt med lönsamhet
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Fetch active projects
    const { data: projects } = await supabase
      .from('project')
      .select('project_id, name, status, quote_id, budget_hours, budget_amount')
      .eq('business_id', businessId)
      .in('status', ['active', 'planning'])
      .order('updated_at', { ascending: false })
      .limit(10)

    if (!projects || projects.length === 0) {
      return NextResponse.json({ projects: [] })
    }

    const results = await Promise.all(
      projects.map(async (project: any) => {
        // Get quote total
        let quoteAmount = 0
        if (project.quote_id) {
          const { data: quote } = await supabase
            .from('quotes')
            .select('total')
            .eq('quote_id', project.quote_id)
            .single()
          quoteAmount = quote?.total || 0
        }

        // Get ATA
        const { data: changes } = await supabase
          .from('project_change')
          .select('change_type, amount')
          .eq('project_id', project.project_id)
          .eq('status', 'approved')

        const ataAdditions = (changes || [])
          .filter((c: any) => c.change_type === 'addition' || c.change_type === 'change')
          .reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
        const ataRemovals = (changes || [])
          .filter((c: any) => c.change_type === 'removal')
          .reduce((sum: number, c: any) => sum + Math.abs(c.amount || 0), 0)

        // Get material sell total
        const { data: mats } = await supabase
          .from('project_material')
          .select('total_sell')
          .eq('project_id', project.project_id)

        const materialSell = (mats || []).reduce((s: number, m: any) => s + (m.total_sell || 0), 0)

        // Get time costs
        const { data: timeEntries } = await supabase
          .from('time_entry')
          .select('duration_minutes, hourly_rate')
          .eq('project_id', project.project_id)

        const timeCost = (timeEntries || []).reduce((sum: number, e: any) => {
          return sum + ((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0)
        }, 0)
        const hoursWorked = (timeEntries || []).reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0) / 60

        // Get material purchase costs
        const { data: matPurchase } = await supabase
          .from('project_material')
          .select('total_purchase')
          .eq('project_id', project.project_id)

        const materialPurchase = (matPurchase || []).reduce((s: number, m: any) => s + (m.total_purchase || 0), 0)

        // Get extra costs
        const { data: extraCosts } = await supabase
          .from('project_cost')
          .select('amount')
          .eq('project_id', project.project_id)

        const extraTotal = (extraCosts || []).reduce((s: number, c: any) => s + (c.amount || 0), 0)

        const totalRevenue = quoteAmount + ataAdditions - ataRemovals + materialSell
        const totalCosts = timeCost + materialPurchase + extraTotal
        const marginAmount = totalRevenue - totalCosts
        const marginPercent = totalRevenue > 0 ? (marginAmount / totalRevenue) * 100 : 0

        return {
          project_id: project.project_id,
          name: project.name,
          status: project.status,
          revenue: Math.round(totalRevenue),
          costs: Math.round(totalCosts),
          margin_amount: Math.round(marginAmount),
          margin_percent: Math.round(marginPercent * 10) / 10,
          hours_worked: Math.round(hoursWorked * 100) / 100,
          budget_hours: project.budget_hours || 0,
        }
      })
    )

    // Sort by revenue descending and take top 5
    const sorted = results
      .filter(p => p.revenue > 0 || p.costs > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    return NextResponse.json({ projects: sorted })
  } catch (error: any) {
    console.error('Dashboard profitability error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

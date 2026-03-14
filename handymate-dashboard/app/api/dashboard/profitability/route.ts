import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/dashboard/profitability - Topp 5 aktiva projekt med lönsamhet
 * Optimized: batch all data in parallel instead of N+1 queries per project
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

    const projectIds = projects.map((p: any) => p.project_id)
    const quoteIds = projects
      .map((p: any) => p.quote_id)
      .filter((id: string | null): id is string => !!id)

    // Batch all queries in parallel — 5 queries instead of 61
    const [quotesResult, changesResult, materialsResult, timeResult, costsResult] = await Promise.all([
      // All quotes for these projects
      quoteIds.length > 0
        ? supabase.from('quotes').select('quote_id, total').in('quote_id', quoteIds)
        : Promise.resolve({ data: [] }),
      // All approved changes
      supabase.from('project_change').select('project_id, change_type, amount')
        .in('project_id', projectIds).eq('status', 'approved'),
      // All materials (both sell and purchase)
      supabase.from('project_material').select('project_id, total_sell, total_purchase')
        .in('project_id', projectIds),
      // All time entries
      supabase.from('time_entry').select('project_id, duration_minutes, hourly_rate')
        .in('project_id', projectIds),
      // All extra costs
      supabase.from('project_cost').select('project_id, amount')
        .in('project_id', projectIds),
    ])

    // Build lookup maps
    const quoteMap = new Map<string, number>()
    for (const q of (quotesResult.data || []) as any[]) {
      quoteMap.set(q.quote_id, q.total || 0)
    }

    const results = projects.map((project: any) => {
      const pid = project.project_id

      // Quote amount
      const quoteAmount = project.quote_id ? (quoteMap.get(project.quote_id) || 0) : 0

      // ATA changes
      const changes = ((changesResult.data || []) as any[]).filter((c) => c.project_id === pid)
      const ataAdditions = changes
        .filter((c) => c.change_type === 'addition' || c.change_type === 'change')
        .reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
      const ataRemovals = changes
        .filter((c) => c.change_type === 'removal')
        .reduce((sum: number, c: any) => sum + Math.abs(c.amount || 0), 0)

      // Materials
      const mats = ((materialsResult.data || []) as any[]).filter((m) => m.project_id === pid)
      const materialSell = mats.reduce((s: number, m: any) => s + (m.total_sell || 0), 0)
      const materialPurchase = mats.reduce((s: number, m: any) => s + (m.total_purchase || 0), 0)

      // Time
      const timeEntries = ((timeResult.data || []) as any[]).filter((t) => t.project_id === pid)
      const timeCost = timeEntries.reduce((sum: number, e: any) =>
        sum + ((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0), 0)
      const hoursWorked = timeEntries.reduce((sum: number, e: any) =>
        sum + (e.duration_minutes || 0), 0) / 60

      // Extra costs
      const extras = ((costsResult.data || []) as any[]).filter((c) => c.project_id === pid)
      const extraTotal = extras.reduce((s: number, c: any) => s + (c.amount || 0), 0)

      const totalRevenue = quoteAmount + ataAdditions - ataRemovals + materialSell
      const totalCosts = timeCost + materialPurchase + extraTotal
      const marginAmount = totalRevenue - totalCosts
      const marginPercent = totalRevenue > 0 ? (marginAmount / totalRevenue) * 100 : 0

      return {
        project_id: pid,
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

    // Sort by revenue descending and take top 5
    const sorted = results
      .filter((p: { revenue: number; costs: number }) => p.revenue > 0 || p.costs > 0)
      .sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue)
      .slice(0, 5)

    return NextResponse.json({ projects: sorted })
  } catch (error: any) {
    console.error('Dashboard profitability error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * GET - Jämför rapporterad tid vs offerterad tid per projekt
 * Visar budget vs faktiskt för att identifiera lönsamhetsproblem
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver see_financials
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const status = request.nextUrl.searchParams.get('status') || 'active'

    // Hämta projekt med offerter
    let projectQuery = supabase
      .from('project')
      .select(`
        project_id, name, status,
        customer:customer_id (customer_id, name),
        quote_id
      `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (status !== 'all') {
      projectQuery = projectQuery.eq('status', status)
    }

    const { data: projects, error: projError } = await projectQuery
    if (projError) throw projError

    if (!projects || projects.length === 0) {
      return NextResponse.json({ projects: [] })
    }

    const projectIds = projects.map((p: any) => p.project_id)
    const quoteIds = projects.map((p: any) => p.quote_id).filter(Boolean)

    // Hämta alla tidsrapporter för dessa projekt
    const { data: timeEntries } = await supabase
      .from('time_entry')
      .select('project_id, duration_minutes, hourly_rate, is_billable, work_category')
      .eq('business_id', businessId)
      .in('project_id', projectIds)

    // Hämta resor kopplade till dessa projekt
    const { data: travels } = await supabase
      .from('travel_entry')
      .select('project_id, distance_km, total_amount')
      .eq('business_id', businessId)
      .in('project_id', projectIds)

    // Hämta offertdata (budgeterad tid och belopp)
    let quotesMap: Record<string, { laborTotal: number; materialTotal: number; total: number; laborHours: number }> = {}
    if (quoteIds.length > 0) {
      const { data: quotes } = await supabase
        .from('quotes')
        .select('quote_id, labor_total, material_total, total, items')
        .in('quote_id', quoteIds)

      for (const q of quotes || []) {
        // Beräkna offererade timmar från items
        let laborHours = 0
        if (Array.isArray(q.items)) {
          for (const item of q.items) {
            if (item.type === 'labor' || item.is_rot_eligible || item.is_rut_eligible) {
              laborHours += (item.quantity || 0)
            }
          }
        }
        quotesMap[q.quote_id] = {
          laborTotal: q.labor_total || 0,
          materialTotal: q.material_total || 0,
          total: q.total || 0,
          laborHours,
        }
      }
    }

    // Gruppera tidsdata per projekt
    const timeByProject: Record<string, {
      totalMinutes: number
      billableMinutes: number
      revenue: number
      categories: Record<string, number>
    }> = {}

    for (const entry of timeEntries || []) {
      const pid = entry.project_id
      if (!timeByProject[pid]) {
        timeByProject[pid] = { totalMinutes: 0, billableMinutes: 0, revenue: 0, categories: {} }
      }
      const mins = entry.duration_minutes || 0
      timeByProject[pid].totalMinutes += mins
      if (entry.is_billable) timeByProject[pid].billableMinutes += mins
      if (entry.hourly_rate) timeByProject[pid].revenue += (mins / 60) * entry.hourly_rate

      const cat = entry.work_category || 'work'
      timeByProject[pid].categories[cat] = (timeByProject[pid].categories[cat] || 0) + mins
    }

    // Gruppera resor per projekt
    const travelByProject: Record<string, { km: number; amount: number }> = {}
    for (const t of travels || []) {
      const pid = t.project_id
      if (!travelByProject[pid]) travelByProject[pid] = { km: 0, amount: 0 }
      travelByProject[pid].km += t.distance_km || 0
      travelByProject[pid].amount += t.total_amount || 0
    }

    // Bygg resultat
    const result = projects.map((proj: any) => {
      const time = timeByProject[proj.project_id] || { totalMinutes: 0, billableMinutes: 0, revenue: 0, categories: {} }
      const travel = travelByProject[proj.project_id] || { km: 0, amount: 0 }
      const quote = proj.quote_id ? quotesMap[proj.quote_id] : null

      const actualHours = time.totalMinutes / 60
      const budgetedHours = quote?.laborHours || 0
      const hoursVariance = budgetedHours > 0 ? actualHours - budgetedHours : 0
      const hoursPercent = budgetedHours > 0 ? (actualHours / budgetedHours) * 100 : 0

      const budgetedRevenue = quote?.total || 0
      const actualCost = time.revenue + travel.amount
      const margin = budgetedRevenue > 0 ? budgetedRevenue - actualCost : 0
      const marginPercent = budgetedRevenue > 0 ? (margin / budgetedRevenue) * 100 : 0

      return {
        project_id: proj.project_id,
        name: proj.name,
        status: proj.status,
        customer: proj.customer,
        budget: {
          hours: budgetedHours,
          labor: quote?.laborTotal || 0,
          material: quote?.materialTotal || 0,
          total: budgetedRevenue,
        },
        actual: {
          hours: Math.round(actualHours * 10) / 10,
          billableHours: Math.round(time.billableMinutes / 60 * 10) / 10,
          revenue: Math.round(time.revenue),
          travelKm: Math.round(travel.km * 10) / 10,
          travelCost: Math.round(travel.amount),
          categories: time.categories,
        },
        variance: {
          hours: Math.round(hoursVariance * 10) / 10,
          hoursPercent: Math.round(hoursPercent),
          margin: Math.round(margin),
          marginPercent: Math.round(marginPercent),
        },
      }
    })

    return NextResponse.json({ projects: result })
  } catch (error: any) {
    console.error('Project comparison error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

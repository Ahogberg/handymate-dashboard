import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * GET - Veckoöversikt per medarbetare
 * Query params: week (ISO-datum, t.ex. 2026-02-23), businessUserId
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver approve_time för att se alla medarbetares data
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'approve_time')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const weekParam = request.nextUrl.searchParams.get('week')
    const userFilter = request.nextUrl.searchParams.get('businessUserId')

    // Beräkna veckostart (måndag)
    const refDate = weekParam ? new Date(weekParam) : new Date()
    const dayOfWeek = refDate.getDay()
    const monday = new Date(refDate)
    monday.setDate(refDate.getDate() - ((dayOfWeek + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const startDate = monday.toISOString().split('T')[0]
    const endDate = sunday.toISOString().split('T')[0]

    // Hämta alla time_entry denna vecka
    let query = supabase
      .from('time_entry')
      .select(`
        time_entry_id, work_date, duration_minutes, break_minutes,
        is_billable, invoiced, hourly_rate, approval_status, work_category,
        overtime_minutes, description,
        business_user:business_user_id (id, name, color),
        customer:customer_id (customer_id, name)
      `)
      .eq('business_id', businessId)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date')

    if (userFilter) {
      query = query.eq('business_user_id', userFilter)
    }

    const { data: entries, error } = await query
    if (error) throw error

    // Hämta resor
    let travelQuery = supabase
      .from('travel_entry')
      .select('id, date, distance_km, total_amount, allowance_amount, business_user_id')
      .eq('business_id', businessId)
      .gte('date', startDate)
      .lte('date', endDate)

    if (userFilter) {
      travelQuery = travelQuery.eq('business_user_id', userFilter)
    }

    const { data: travels } = await travelQuery

    // Hämta business_config för övertidsgränser
    const { data: config } = await supabase
      .from('business_config')
      .select('standard_work_hours, overtime_after')
      .eq('business_id', businessId)
      .single()

    const dailyLimit = ((config?.overtime_after || config?.standard_work_hours || 8) * 60)
    const weeklyLimit = (config?.standard_work_hours || 8) * 5 * 60

    // Gruppera per medarbetare
    const byUser = new Map<string, {
      user: { id: string; name: string; color: string }
      days: Record<string, { minutes: number; billable: number; overtime: number; entries: number; categories: Record<string, number> }>
      totalMinutes: number
      billableMinutes: number
      overtimeMinutes: number
      totalEntries: number
      revenue: number
      travelKm: number
      travelAmount: number
      allowanceAmount: number
    }>()

    for (const entry of entries || []) {
      const userId = (entry.business_user as any)?.id || 'unknown'
      const userName = (entry.business_user as any)?.name || 'Okänd'
      const userColor = (entry.business_user as any)?.color || '#94a3b8'

      if (!byUser.has(userId)) {
        byUser.set(userId, {
          user: { id: userId, name: userName, color: userColor },
          days: {},
          totalMinutes: 0,
          billableMinutes: 0,
          overtimeMinutes: 0,
          totalEntries: 0,
          revenue: 0,
          travelKm: 0,
          travelAmount: 0,
          allowanceAmount: 0,
        })
      }

      const userdata = byUser.get(userId)!
      const date = entry.work_date

      if (!userdata.days[date]) {
        userdata.days[date] = { minutes: 0, billable: 0, overtime: 0, entries: 0, categories: {} }
      }

      const mins = entry.duration_minutes || 0
      userdata.days[date].minutes += mins
      userdata.days[date].entries += 1
      userdata.totalMinutes += mins
      userdata.totalEntries += 1

      if (entry.is_billable) {
        userdata.days[date].billable += mins
        userdata.billableMinutes += mins
      }

      const cat = (entry as any).work_category || 'work'
      userdata.days[date].categories[cat] = (userdata.days[date].categories[cat] || 0) + mins

      if (entry.hourly_rate) {
        userdata.revenue += (mins / 60) * entry.hourly_rate
      }
    }

    // Beräkna övertid per dag per person
    byUser.forEach((userdata) => {
      Object.values(userdata.days).forEach((day) => {
        const ot = Math.max(0, day.minutes - dailyLimit)
        day.overtime = ot
        userdata.overtimeMinutes += ot
      })
      // Vecko-övertid (utöver daglig)
      const regularAfterDaily = userdata.totalMinutes - userdata.overtimeMinutes
      const weeklyOT = Math.max(0, regularAfterDaily - weeklyLimit)
      userdata.overtimeMinutes += weeklyOT
    })

    // Lägg till resor per person
    for (const travel of travels || []) {
      const userId = travel.business_user_id || 'unknown'
      if (byUser.has(userId)) {
        const u = byUser.get(userId)!
        u.travelKm += travel.distance_km || 0
        u.travelAmount += travel.total_amount || 0
        u.allowanceAmount += travel.allowance_amount || 0
      }
    }

    // Bygg dagar-array (mån-sön)
    const weekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      weekDates.push(d.toISOString().split('T')[0])
    }

    const employees = Array.from(byUser.values()).map(u => ({
      ...u,
      daysArray: weekDates.map(date => ({
        date,
        ...(u.days[date] || { minutes: 0, billable: 0, overtime: 0, entries: 0, categories: {} }),
      })),
    }))

    // Totaler
    const grandTotal = {
      minutes: employees.reduce((s, e) => s + e.totalMinutes, 0),
      billable: employees.reduce((s, e) => s + e.billableMinutes, 0),
      overtime: employees.reduce((s, e) => s + e.overtimeMinutes, 0),
      revenue: employees.reduce((s, e) => s + e.revenue, 0),
      travelKm: employees.reduce((s, e) => s + e.travelKm, 0),
      travelAmount: employees.reduce((s, e) => s + e.travelAmount, 0),
    }

    return NextResponse.json({
      week: {
        start: startDate,
        end: endDate,
        dates: weekDates,
      },
      employees,
      totals: grandTotal,
      config: {
        dailyLimit: dailyLimit / 60,
        weeklyLimit: weeklyLimit / 60,
      },
    })
  } catch (error: any) {
    console.error('Weekly report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

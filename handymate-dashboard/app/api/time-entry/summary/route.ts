import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness } from '@/lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET - Hämta sammanfattad tidrapport
 * Query params:
 *   startDate, endDate (required)
 *   groupBy: customer | booking | work_type | date | week (default: date)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    const groupBy = request.nextUrl.searchParams.get('groupBy') || 'date'

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate och endDate krävs' }, { status: 400 })
    }

    const { data: entries, error } = await supabase
      .from('time_entry')
      .select(`
        *,
        customer:customer_id (customer_id, name),
        booking:booking_id (booking_id, notes),
        work_type:work_type_id (work_type_id, name, multiplier)
      `)
      .eq('business_id', business.business_id)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date')

    if (error) throw error

    const items = entries || []

    // Global totals
    const totalMinutes = items.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const billableMinutes = items.filter((e: any) => e.is_billable).reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const totalRevenue = items.reduce((sum: number, e: any) => {
      const hours = (e.duration_minutes || 0) / 60
      return sum + (hours * (e.hourly_rate || 0))
    }, 0)
    const uninvoicedMinutes = items.filter((e: any) => !e.invoiced && e.is_billable).reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const uninvoicedRevenue = items.filter((e: any) => !e.invoiced && e.is_billable).reduce((sum: number, e: any) => {
      const hours = (e.duration_minutes || 0) / 60
      return sum + (hours * (e.hourly_rate || 0))
    }, 0)

    // Group entries
    const groups: Record<string, { label: string; total_minutes: number; billable_minutes: number; revenue: number; count: number }> = {}

    for (const entry of items as any[]) {
      let key: string
      let label: string

      switch (groupBy) {
        case 'customer':
          key = entry.customer_id || 'none'
          label = entry.customer?.name || 'Ingen kund'
          break
        case 'booking':
          key = entry.booking_id || 'none'
          label = entry.booking?.notes?.substring(0, 50) || 'Ingen bokning'
          break
        case 'work_type':
          key = entry.work_type_id || 'none'
          label = entry.work_type?.name || 'Ingen arbetstyp'
          break
        case 'week': {
          const d = new Date(entry.work_date)
          const weekNum = getWeekNumber(d)
          key = `${d.getFullYear()}-W${weekNum}`
          label = `Vecka ${weekNum}`
          break
        }
        default: // date
          key = entry.work_date
          label = entry.work_date
      }

      if (!groups[key]) {
        groups[key] = { label, total_minutes: 0, billable_minutes: 0, revenue: 0, count: 0 }
      }

      groups[key].total_minutes += entry.duration_minutes || 0
      groups[key].count++
      if (entry.is_billable) {
        groups[key].billable_minutes += entry.duration_minutes || 0
      }
      const hours = (entry.duration_minutes || 0) / 60
      groups[key].revenue += hours * (entry.hourly_rate || 0)
    }

    // Convert to array and round
    const summary = Object.entries(groups).map(([key, val]) => ({
      key,
      label: val.label,
      total_minutes: val.total_minutes,
      total_hours: Math.round((val.total_minutes / 60) * 10) / 10,
      billable_minutes: val.billable_minutes,
      revenue: Math.round(val.revenue),
      count: val.count
    }))

    return NextResponse.json({
      summary,
      totals: {
        total_minutes: totalMinutes,
        total_hours: Math.round((totalMinutes / 60) * 10) / 10,
        billable_minutes: billableMinutes,
        billable_hours: Math.round((billableMinutes / 60) * 10) / 10,
        revenue: Math.round(totalRevenue),
        uninvoiced_minutes: uninvoicedMinutes,
        uninvoiced_hours: Math.round((uninvoicedMinutes / 60) * 10) / 10,
        uninvoiced_revenue: Math.round(uninvoicedRevenue),
        count: items.length
      }
    })

  } catch (error: unknown) {
    console.error('Get time summary error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch summary'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

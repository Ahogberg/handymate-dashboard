import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET - Hämta dashboard-statistik för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    // Datumgränser
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay() + 1) // Måndag
    startOfWeek.setHours(0, 0, 0, 0)

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const startOfLastWeek = new Date(startOfWeek)
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)

    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    // === BOKNINGAR ===
    const { count: bookingsWeek } = await supabase
      .from('booking')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('scheduled_start', startOfWeek.toISOString())

    const { count: bookingsMonth } = await supabase
      .from('booking')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('scheduled_start', startOfMonth.toISOString())

    const { count: bookingsLastWeek } = await supabase
      .from('booking')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('scheduled_start', startOfLastWeek.toISOString())
      .lt('scheduled_start', startOfWeek.toISOString())

    // === KUNDER ===
    const { count: newCustomersMonth } = await supabase
      .from('customer')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', startOfMonth.toISOString())

    const { count: totalCustomers } = await supabase
      .from('customer')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)

    const { count: newCustomersLastMonth } = await supabase
      .from('customer')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', startOfLastMonth.toISOString())
      .lt('created_at', startOfMonth.toISOString())

    // === SAMTAL ===
    const { count: callsWeek } = await supabase
      .from('call_recording')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', startOfWeek.toISOString())

    const { count: callsMonth } = await supabase
      .from('call_recording')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', startOfMonth.toISOString())

    const { count: callsLastWeek } = await supabase
      .from('call_recording')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', startOfLastWeek.toISOString())
      .lt('created_at', startOfWeek.toISOString())

    // === OFFERTER ===
    const { data: quotesData } = await supabase
      .from('quotes')
      .select('status, total')
      .eq('business_id', businessId)
      .neq('status', 'draft')

    const sentQuotes = quotesData?.filter((q: { status: string; total: number }) => q.status === 'sent').length || 0
    const acceptedQuotes = quotesData?.filter((q: { status: string; total: number }) => q.status === 'accepted').length || 0
    const totalQuoteValue = quotesData?.reduce((sum: number, q: { status: string; total: number }) => sum + (q.total || 0), 0) || 0
    const acceptedQuoteValue = quotesData
      ?.filter((q: { status: string; total: number }) => q.status === 'accepted')
      .reduce((sum: number, q: { status: string; total: number }) => sum + (q.total || 0), 0) || 0

    const acceptanceRate = sentQuotes + acceptedQuotes > 0
      ? Math.round((acceptedQuotes / (sentQuotes + acceptedQuotes)) * 100)
      : 0

    // === TIDRAPPORT ===
    const { data: timeDataWeek } = await supabase
      .from('time_entry')
      .select('duration_minutes, is_billable, hourly_rate')
      .eq('business_id', businessId)
      .gte('work_date', startOfWeek.toISOString().split('T')[0])

    const { data: timeDataMonth } = await supabase
      .from('time_entry')
      .select('duration_minutes, is_billable, hourly_rate')
      .eq('business_id', businessId)
      .gte('work_date', startOfMonth.toISOString().split('T')[0])

    const weekMinutes = timeDataWeek?.reduce((sum: number, t: { duration_minutes: number }) => sum + (t.duration_minutes || 0), 0) || 0
    const monthMinutes = timeDataMonth?.reduce((sum: number, t: { duration_minutes: number }) => sum + (t.duration_minutes || 0), 0) || 0

    const weekHours = Math.round((weekMinutes / 60) * 10) / 10
    const monthHours = Math.round((monthMinutes / 60) * 10) / 10

    // Beräkna omsättning från tidrapport
    type TimeEntry = { duration_minutes: number; is_billable: boolean; hourly_rate: number | null }
    const monthRevenue = timeDataMonth
      ?.filter((t: TimeEntry) => t.is_billable && t.hourly_rate)
      .reduce((sum: number, t: TimeEntry) => sum + ((t.duration_minutes / 60) * (t.hourly_rate || 0)), 0) || 0

    // === AI-FÖRSLAG ===
    const { count: pendingSuggestions } = await supabase
      .from('ai_suggestion')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending')

    // === BOKNINGAR PER DAG (senaste 7 dagarna) ===
    const bookingsPerDay: { date: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]

      const { count } = await supabase
        .from('booking')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('scheduled_start', `${dateStr}T00:00:00`)
        .lt('scheduled_start', `${dateStr}T23:59:59`)

      bookingsPerDay.push({
        date: dateStr,
        count: count || 0
      })
    }

    // Beräkna trender
    const bookingsTrend = bookingsLastWeek
      ? Math.round(((bookingsWeek || 0) - bookingsLastWeek) / bookingsLastWeek * 100)
      : 0

    const customersTrend = newCustomersLastMonth
      ? Math.round(((newCustomersMonth || 0) - newCustomersLastMonth) / newCustomersLastMonth * 100)
      : 0

    const callsTrend = callsLastWeek
      ? Math.round(((callsWeek || 0) - callsLastWeek) / callsLastWeek * 100)
      : 0

    return NextResponse.json({
      bookings: {
        week: bookingsWeek || 0,
        month: bookingsMonth || 0,
        trend: bookingsTrend
      },
      customers: {
        new_this_month: newCustomersMonth || 0,
        total: totalCustomers || 0,
        trend: customersTrend
      },
      calls: {
        week: callsWeek || 0,
        month: callsMonth || 0,
        trend: callsTrend
      },
      quotes: {
        sent: sentQuotes,
        accepted: acceptedQuotes,
        acceptance_rate: acceptanceRate,
        total_value: Math.round(totalQuoteValue),
        accepted_value: Math.round(acceptedQuoteValue)
      },
      time: {
        week_hours: weekHours,
        month_hours: monthHours
      },
      revenue: {
        month: Math.round(monthRevenue)
      },
      ai: {
        pending_suggestions: pendingSuggestions || 0
      },
      bookings_per_day: bookingsPerDay
    })

  } catch (error: any) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

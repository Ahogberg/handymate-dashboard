import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

// Force dynamic to prevent static generation
export const dynamic = 'force-dynamic'

/**
 * GET - Hämta dashboard-statistik för ett företag
 * Optimized: all queries run in parallel via Promise.all
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Datumgränser
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay() + 1)
    startOfWeek.setHours(0, 0, 0, 0)

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastWeek = new Date(startOfWeek)
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    // Build 7-day date ranges for bookings per day
    const dayRanges: { dateStr: string; start: string; end: string }[] = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      dayRanges.push({ dateStr, start: `${dateStr}T00:00:00`, end: `${dateStr}T23:59:59` })
    }

    // Run ALL queries in parallel
    const [
      bookingsWeekRes, bookingsMonthRes, bookingsLastWeekRes,
      newCustomersMonthRes, totalCustomersRes, newCustomersLastMonthRes,
      callsWeekRes, callsMonthRes, callsLastWeekRes,
      quotesRes, timeWeekRes, timeMonthRes, pendingSuggestionsRes,
      ...dailyBookingsRes
    ] = await Promise.all([
      // Bokningar
      supabase.from('booking').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).gte('scheduled_start', startOfWeek.toISOString()),
      supabase.from('booking').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).gte('scheduled_start', startOfMonth.toISOString()),
      supabase.from('booking').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('scheduled_start', startOfLastWeek.toISOString())
        .lt('scheduled_start', startOfWeek.toISOString()),
      // Kunder
      supabase.from('customer').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).gte('created_at', startOfMonth.toISOString()),
      supabase.from('customer').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId),
      supabase.from('customer').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('created_at', startOfLastMonth.toISOString())
        .lt('created_at', startOfMonth.toISOString()),
      // Samtal
      supabase.from('call_recording').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).gte('created_at', startOfWeek.toISOString()),
      supabase.from('call_recording').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).gte('created_at', startOfMonth.toISOString()),
      supabase.from('call_recording').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .gte('created_at', startOfLastWeek.toISOString())
        .lt('created_at', startOfWeek.toISOString()),
      // Offerter
      supabase.from('quotes').select('status, total')
        .eq('business_id', businessId).neq('status', 'draft'),
      // Tidrapport
      supabase.from('time_entry').select('duration_minutes, is_billable, hourly_rate')
        .eq('business_id', businessId).gte('work_date', startOfWeek.toISOString().split('T')[0]),
      supabase.from('time_entry').select('duration_minutes, is_billable, hourly_rate')
        .eq('business_id', businessId).gte('work_date', startOfMonth.toISOString().split('T')[0]),
      // AI-förslag
      supabase.from('ai_suggestion').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('status', 'pending'),
      // Bokningar per dag (7 parallella queries istället för loop)
      ...dayRanges.map(({ start, end }) =>
        supabase.from('booking').select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('scheduled_start', start)
          .lt('scheduled_start', end)
      ),
    ])

    // Extract counts
    const bookingsWeek = bookingsWeekRes.count || 0
    const bookingsMonth = bookingsMonthRes.count || 0
    const bookingsLastWeek = bookingsLastWeekRes.count || 0
    const newCustomersMonth = newCustomersMonthRes.count || 0
    const totalCustomers = totalCustomersRes.count || 0
    const newCustomersLastMonth = newCustomersLastMonthRes.count || 0
    const callsWeek = callsWeekRes.count || 0
    const callsMonth = callsMonthRes.count || 0
    const callsLastWeek = callsLastWeekRes.count || 0
    const pendingSuggestions = pendingSuggestionsRes.count || 0

    // Offerter
    const quotesData = quotesRes.data || []
    type QuoteRow = { status: string; total: number }
    const sentQuotes = quotesData.filter((q: QuoteRow) => q.status === 'sent').length
    const acceptedQuotes = quotesData.filter((q: QuoteRow) => q.status === 'accepted').length
    const totalQuoteValue = quotesData.reduce((sum: number, q: QuoteRow) => sum + (q.total || 0), 0)
    const acceptedQuoteValue = quotesData
      .filter((q: QuoteRow) => q.status === 'accepted')
      .reduce((sum: number, q: QuoteRow) => sum + (q.total || 0), 0)
    const acceptanceRate = sentQuotes + acceptedQuotes > 0
      ? Math.round((acceptedQuotes / (sentQuotes + acceptedQuotes)) * 100) : 0

    // Tidrapport
    type TimeRow = { duration_minutes: number; is_billable: boolean; hourly_rate: number | null }
    const timeDataWeek = (timeWeekRes.data || []) as TimeRow[]
    const timeDataMonth = (timeMonthRes.data || []) as TimeRow[]
    const weekMinutes = timeDataWeek.reduce((sum, t) => sum + (t.duration_minutes || 0), 0)
    const monthMinutes = timeDataMonth.reduce((sum, t) => sum + (t.duration_minutes || 0), 0)
    const weekHours = Math.round((weekMinutes / 60) * 10) / 10
    const monthHours = Math.round((monthMinutes / 60) * 10) / 10
    const monthRevenue = timeDataMonth
      .filter(t => t.is_billable && t.hourly_rate)
      .reduce((sum, t) => sum + ((t.duration_minutes / 60) * (t.hourly_rate || 0)), 0)

    // Bokningar per dag
    const bookingsPerDay = dayRanges.map((day, i) => ({
      date: day.dateStr,
      count: dailyBookingsRes[i]?.count || 0,
    }))

    // Trender
    const bookingsTrend = bookingsLastWeek
      ? Math.round((bookingsWeek - bookingsLastWeek) / bookingsLastWeek * 100) : 0
    const customersTrend = newCustomersLastMonth
      ? Math.round((newCustomersMonth - newCustomersLastMonth) / newCustomersLastMonth * 100) : 0
    const callsTrend = callsLastWeek
      ? Math.round((callsWeek - callsLastWeek) / callsLastWeek * 100) : 0

    return NextResponse.json({
      bookings: { week: bookingsWeek, month: bookingsMonth, trend: bookingsTrend },
      customers: { new_this_month: newCustomersMonth, total: totalCustomers, trend: customersTrend },
      calls: { week: callsWeek, month: callsMonth, trend: callsTrend },
      quotes: {
        sent: sentQuotes, accepted: acceptedQuotes, acceptance_rate: acceptanceRate,
        total_value: Math.round(totalQuoteValue), accepted_value: Math.round(acceptedQuoteValue),
      },
      time: { week_hours: weekHours, month_hours: monthHours },
      revenue: { month: Math.round(monthRevenue) },
      ai: { pending_suggestions: pendingSuggestions },
      bookings_per_day: bookingsPerDay,
    })
  } catch (error: any) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Hämta kalender-händelser (bokningar + schedule entries)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const from = request.nextUrl.searchParams.get('from')
    const to = request.nextUrl.searchParams.get('to')

    // Fetch bookings
    let bookingQuery = supabase
      .from('booking')
      .select('*')
      .eq('business_id', business.business_id)
      .neq('status', 'cancelled')
      .order('scheduled_start', { ascending: true })

    if (from) bookingQuery = bookingQuery.gte('scheduled_start', from)
    if (to) bookingQuery = bookingQuery.lte('scheduled_start', to)

    const { data: bookings } = await bookingQuery

    // Fetch schedule entries (if table exists)
    let scheduleEntries: any[] = []
    try {
      let scheduleQuery = supabase
        .from('schedule_entry')
        .select('*')
        .eq('business_id', business.business_id)
        .neq('status', 'cancelled')
        .order('start_datetime', { ascending: true })

      if (from) scheduleQuery = scheduleQuery.gte('start_datetime', from)
      if (to) scheduleQuery = scheduleQuery.lte('start_datetime', to)

      const { data } = await scheduleQuery
      scheduleEntries = data || []
    } catch {
      // Table may not exist yet
    }

    // Combine into unified event list
    const events = [
      ...(bookings || []).map((b: any) => ({
        id: b.booking_id,
        type: 'booking' as const,
        title: b.service_type || 'Bokning',
        start: b.scheduled_start,
        end: b.scheduled_end,
        status: b.status,
        customer_id: b.customer_id,
        notes: b.notes,
      })),
      ...scheduleEntries.map((s: any) => ({
        id: s.id,
        type: s.type || 'schedule' as const,
        title: s.title,
        start: s.start_datetime,
        end: s.end_datetime,
        status: s.status,
        all_day: s.all_day,
        external_source: s.external_source,
      })),
    ]

    return NextResponse.json({ events })
  } catch (error: any) {
    console.error('Get calendar events error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

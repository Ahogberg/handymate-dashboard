import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

/**
 * GET /api/calendar/events?start=2026-03-10&end=2026-03-17
 * Returns both Handymate bookings and Google Calendar events
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const start = request.nextUrl.searchParams.get('start')
    const end = request.nextUrl.searchParams.get('end')

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end params required' }, { status: 400 })
    }

    // 1. Fetch Handymate bookings with customer info
    const { data: bookings } = await supabase
      .from('booking')
      .select(`
        booking_id, customer_id, scheduled_start, scheduled_end, status, notes,
        customer (name, phone_number)
      `)
      .eq('business_id', business.business_id)
      .neq('status', 'cancelled')
      .gte('scheduled_start', `${start}T00:00:00`)
      .lte('scheduled_start', `${end}T23:59:59`)
      .order('scheduled_start', { ascending: true })

    const handymate = (bookings || []).map((b: any) => ({
      id: b.booking_id,
      title: b.notes ? b.notes.split(' - ')[0] : 'Bokning',
      start: b.scheduled_start,
      end: b.scheduled_end,
      status: b.status,
      customerId: b.customer_id,
      customerName: b.customer?.name || 'Okänd kund',
      customerPhone: b.customer?.phone_number || null,
    }))

    // 2. Fetch Google Calendar events (graceful fallback)
    let google: any[] = []
    let googleConnected = false
    try {
      const currentUser = await getCurrentUser(request)
      if (currentUser) {
        const { data: connection } = await supabase
          .from('calendar_connection')
          .select('access_token, refresh_token, token_expires_at, calendar_id, sync_enabled')
          .eq('business_user_id', currentUser.id)
          .eq('provider', 'google')
          .single()

        if (connection?.access_token && connection.sync_enabled !== false) {
          googleConnected = true
          const { ensureValidToken, getCalendarEvents } = await import('@/lib/google-calendar')
          const tokenResult = await ensureValidToken(connection)

          if (tokenResult) {
            // Update token if it was refreshed
            if (tokenResult.access_token !== connection.access_token) {
              await supabase
                .from('calendar_connection')
                .update({
                  access_token: tokenResult.access_token,
                  token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
                })
                .eq('business_user_id', currentUser.id)
                .eq('provider', 'google')
            }

            const calendarId = connection.calendar_id || 'primary'
            const events = await getCalendarEvents(
              tokenResult.access_token,
              calendarId,
              new Date(`${start}T00:00:00`),
              new Date(`${end}T23:59:59`)
            )

            google = events.map((e) => ({
              id: e.id,
              title: e.summary || '(Ingen titel)',
              start: e.start.toISOString(),
              end: e.end.toISOString(),
              allDay: e.allDay,
            }))
          }
        }
      }
    } catch (err) {
      console.error('Google Calendar fetch failed (non-fatal):', err)
      // Non-fatal — return empty google array
    }

    return NextResponse.json({ handymate, google, googleConnected })
  } catch (error: any) {
    console.error('Calendar events error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

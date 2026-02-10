import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken, getCalendarEvents } from '@/lib/google-calendar'

/**
 * GET /api/google/events
 * Preview events from Google Calendar
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: connection, error } = await supabase
      .from('calendar_connection')
      .select('*')
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')
      .single()

    if (error || !connection) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 404 })
    }

    // Ensure valid token
    const tokenResult = await ensureValidToken(connection)
    if (!tokenResult) {
      return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 })
    }

    // Get date range from query params (default: current month)
    const now = new Date()
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const startDateParam = request.nextUrl.searchParams.get('start_date')
    const endDateParam = request.nextUrl.searchParams.get('end_date')

    const startDate = startDateParam ? new Date(startDateParam) : defaultStart
    const endDate = endDateParam ? new Date(endDateParam) : defaultEnd

    const calendarId = connection.calendar_id || 'primary'
    const events = await getCalendarEvents(tokenResult.access_token, calendarId, startDate, endDate)

    return NextResponse.json({ events })
  } catch (error: unknown) {
    console.error('Google events error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get events'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

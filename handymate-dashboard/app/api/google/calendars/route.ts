import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken, getCalendarList } from '@/lib/google-calendar'

/**
 * GET /api/google/calendars
 * List available Google Calendars for the connected account
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

    const calendars = await getCalendarList(tokenResult.access_token)

    return NextResponse.json({ calendars })
  } catch (error: unknown) {
    console.error('Google calendars error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get calendars'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

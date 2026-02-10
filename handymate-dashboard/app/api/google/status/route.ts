import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { ensureValidToken } from '@/lib/google-calendar'

/**
 * GET /api/google/status
 * Get Google Calendar connection status
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
      return NextResponse.json({ connected: false })
    }

    // Try to ensure the token is valid, refresh if needed
    const tokenResult = await ensureValidToken(connection)
    if (tokenResult && tokenResult.access_token !== connection.access_token) {
      // Token was refreshed, update in DB
      await supabase
        .from('calendar_connection')
        .update({
          access_token: tokenResult.access_token,
          token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
        })
        .eq('id', connection.id)
    }

    return NextResponse.json({
      connected: !!tokenResult,
      email: connection.account_email,
      calendarId: connection.calendar_id,
      syncDirection: connection.sync_direction || 'both',
      syncEnabled: connection.sync_enabled ?? false,
      lastSyncAt: connection.last_sync_at || null,
      syncError: connection.sync_error || null,
      connectedAt: connection.created_at || null,
    })
  } catch (error: unknown) {
    console.error('Google status error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get status'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

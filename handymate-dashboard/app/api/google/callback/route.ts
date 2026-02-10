import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getGoogleTokens, getCalendarList } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'

/**
 * GET /api/google/callback
 * Handle Google OAuth callback
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const stateParam = searchParams.get('state')
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      console.error('Google OAuth error:', error)
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?tab=integrations&google=error`
      )
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?tab=integrations&google=error`
      )
    }

    // Decode and validate state
    let state: { business_id: string; user_id: string; timestamp: number }
    try {
      state = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'))
    } catch {
      console.error('Invalid state parameter')
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?tab=integrations&google=error`
      )
    }

    // Validate timestamp (must be within 10 minutes)
    if (Date.now() - state.timestamp > 10 * 60 * 1000) {
      console.error('State token expired')
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?tab=integrations&google=error`
      )
    }

    // Exchange code for tokens
    const tokens = await getGoogleTokens(code)

    // Get primary calendar
    const calendars = await getCalendarList(tokens.access_token)
    const primaryCalendar = calendars.find((cal) => cal.primary)

    // Save to calendar_connection table
    const supabase = getServerSupabase()
    const id = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { error: upsertError } = await supabase
      .from('calendar_connection')
      .upsert(
        {
          id,
          business_id: state.business_id,
          business_user_id: state.user_id,
          provider: 'google',
          account_email: tokens.email,
          calendar_id: primaryCalendar?.id || 'primary',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(tokens.expiry_date).toISOString(),
        },
        { onConflict: 'business_user_id,provider' }
      )

    if (upsertError) {
      console.error('Error saving calendar connection:', upsertError)
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?tab=integrations&google=error`
      )
    }

    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&google=connected`
    )
  } catch (error: unknown) {
    console.error('Google callback error:', error)
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&google=error`
    )
  }
}

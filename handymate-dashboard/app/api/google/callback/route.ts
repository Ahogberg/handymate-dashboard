import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getGoogleTokens, getCalendarList } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'

function errorRedirect(message: string) {
  return NextResponse.redirect(
    `${APP_URL}/dashboard/settings?tab=integrations&google=error&message=${encodeURIComponent(message)}`
  )
}

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
      return errorRedirect('Google nekade åtkomst: ' + error)
    }

    if (!code || !stateParam) {
      return errorRedirect('Saknar authorization code eller state')
    }

    // Decode and validate state
    let state: { business_id: string; user_id: string; timestamp: number }
    try {
      state = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'))
    } catch {
      console.error('Invalid state parameter')
      return errorRedirect('Ogiltig state-parameter')
    }

    // Validate timestamp (must be within 10 minutes)
    if (Date.now() - state.timestamp > 10 * 60 * 1000) {
      console.error('State token expired')
      return errorRedirect('Sessionen har gått ut, försök igen')
    }

    // Exchange code for tokens
    let tokens
    try {
      tokens = await getGoogleTokens(code)
    } catch (tokenError: unknown) {
      const msg = tokenError instanceof Error ? tokenError.message : 'Token exchange failed'
      console.error('Google token exchange error:', msg)
      return errorRedirect('Kunde inte hämta Google-token: ' + msg)
    }

    // Get primary calendar (non-fatal if it fails)
    let primaryCalendarId = 'primary'
    try {
      const calendars = await getCalendarList(tokens.access_token)
      const primaryCalendar = calendars.find((cal) => cal.primary)
      if (primaryCalendar?.id) primaryCalendarId = primaryCalendar.id
    } catch (calError) {
      console.error('Calendar list error (non-fatal):', calError)
    }

    // Save to calendar_connection table
    const supabase = getServerSupabase()

    // Check if connection already exists for this user
    const { data: existing } = await supabase
      .from('calendar_connection')
      .select('id')
      .eq('business_user_id', state.user_id)
      .eq('provider', 'google')
      .maybeSingle()

    const coreFields = {
      account_email: tokens.email,
      calendar_id: primaryCalendarId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(tokens.expiry_date).toISOString(),
    }

    if (existing) {
      // gmail_scope_granted is defined in gmail_integration.sql — always include it
      const { error: updateErr } = await supabase
        .from('calendar_connection')
        .update({ ...coreFields, gmail_scope_granted: true })
        .eq('id', existing.id)

      if (updateErr) return errorRedirect('Kunde inte uppdatera anslutningen: ' + updateErr.message)
    } else {
      const id = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const { error: insertErr } = await supabase
        .from('calendar_connection')
        .insert({
          id,
          business_id: state.business_id,
          business_user_id: state.user_id,
          provider: 'google',
          ...coreFields,
          gmail_scope_granted: true,
        })

      if (insertErr) return errorRedirect('Kunde inte spara anslutningen: ' + insertErr.message)
    }

    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&google=connected`
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('Google callback error:', msg)
    return errorRedirect(msg)
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getGoogleTokens, getCalendarList } from '@/lib/google-calendar'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { verifyOAuthState } from '@/lib/google/oauth-state'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

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

    // Tenant-svepet 2026-09-01: state var osignerad base64-JSON — vem som
    // helst kunde tillverka en state med ett annat företags id och binda
    // sitt Google-konto till offrets Gmail-sändning, eller lura ett offer
    // att godkänna en state som pekade på angriparens företag. Nu: HMAC-
    // verifierad state (lib/google/oauth-state.ts) OCH sessionen som
    // landar här måste vara samma företag som state bär.
    const verified = verifyOAuthState(stateParam)
    if (!verified.ok) {
      console.error('[google/callback] ogiltig state:', verified.reason)
      return errorRedirect(
        verified.reason === 'expired' ? 'Sessionen har gått ut, försök igen' : 'Ogiltig state-parameter',
      )
    }
    const state = verified.state

    const sessionBusiness = await getAuthenticatedBusiness(request)
    if (!sessionBusiness || sessionBusiness.business_id !== state.business_id) {
      console.error('[google/callback] sessionen matchar inte state', {
        session_business: sessionBusiness?.business_id ?? null,
        state_business: state.business_id,
      })
      return errorRedirect('Logga in på samma konto som startade Google-kopplingen och försök igen')
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
      token_expires_at: new Date(tokens.expiry_date).toISOString(),
    }

    // Google skickar inte alltid ett nytt refresh_token vid re-consent (bara
    // vid FÖRSTA godkännandet, eller om användaren återkallat åtkomsten i sitt
    // Google-konto). Skriver vi över ett befintligt refresh_token med undefined
    // blir kopplingen obrukbar — nästa ensureValidToken-refresh failar tyst.
    const hasNewRefreshToken = !!tokens.refresh_token
    const refreshTokenField = hasNewRefreshToken ? { refresh_token: tokens.refresh_token } : {}

    if (existing) {
      if (!hasNewRefreshToken) {
        console.warn('[google/callback] Inget nytt refresh_token från Google vid re-consent — behåller befintligt värde', {
          connectionId: existing.id,
        })
      }

      // Endast kalenderscope begärs — Gmail kräver dyr säkerhetsaudit
      const { error: updateErr } = await supabase
        .from('calendar_connection')
        .update({ ...coreFields, ...refreshTokenField, gmail_scope_granted: false, gmail_send_scope_granted: false })
        .eq('id', existing.id)

      if (updateErr) return errorRedirect('Kunde inte uppdatera anslutningen: ' + updateErr.message)
    } else {
      if (!hasNewRefreshToken) {
        console.warn('[google/callback] Ny koppling saknar refresh_token — kan inte förnyas automatiskt vid utgång', {
          businessId: state.business_id,
        })
      }

      const id = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      const { error: insertErr } = await supabase
        .from('calendar_connection')
        .insert({
          id,
          business_id: state.business_id,
          business_user_id: state.user_id,
          provider: 'google',
          ...coreFields,
          ...refreshTokenField,
          gmail_scope_granted: false,
          gmail_send_scope_granted: false,
        })

      if (insertErr) return errorRedirect('Kunde inte spara anslutningen: ' + insertErr.message)
    }

    // Synka Gmail-sändning till business_config så att gmail-send.ts hittar det
    // refresh_token skrivs bara när Google faktiskt gav ett nytt — samma
    // regel som calendar_connection ovan; annars nollades det vid re-consent.
    await supabase
      .from('business_config')
      .update({
        gmail_send_enabled: true,
        gmail_email: tokens.email,
        google_access_token: tokens.access_token,
        ...(hasNewRefreshToken ? { google_refresh_token: tokens.refresh_token } : {}),
      })
      .eq('business_id', state.business_id)

    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?tab=integrations&google=connected`
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('Google callback error:', msg)
    return errorRedirect(msg)
  }
}

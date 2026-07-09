import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { saveFortnoxTokens, getFortnoxCompanyInfo } from '@/lib/fortnox'
import { logFortnoxApi } from '@/lib/fortnox/api-log'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
const FORTNOX_AUTH_BASE = 'https://apps.fortnox.se/oauth-v1'

function getRedirectUri(): string {
  return `${APP_URL}/api/integrations/fortnox/callback`
}

function settingsUrl(params: Record<string, string>): string {
  const url = new URL('/dashboard/settings/integrations', APP_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

function onboardingUrl(params: Record<string, string>): string {
  const url = new URL('/onboarding', APP_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

/**
 * Destination-hjälpare: state är `${business_id}:${random}:${destination}`.
 * Startades OAuth från onboarding-importsteget (destination='onboarding')
 * landar callbacken på /onboarding, annars på inställningssidan (default).
 * Bakåtkompatibelt: äldre state utan tredje segment → 'settings'.
 */
function redirectUrlFor(
  state: string | null,
  params: Record<string, string>,
): string {
  const destination = state ? state.split(':')[2] : undefined
  return destination === 'onboarding' ? onboardingUrl(params) : settingsUrl(params)
}

/**
 * Logga callback-attempt till fortnox_api_log med endpoint='oauth_callback'.
 * Non-blocking — fel sväljs. business_id är obligatoriskt; om okänt vid
 * total-failure faller vi tillbaka på console.error utan DB-rad.
 */
async function logCallback(
  businessId: string | null,
  outcome: 'success' | 'error',
  errorMessage: string | null,
  statusCode: number | null = null,
  metadata: Record<string, unknown> | null = null,
): Promise<void> {
  const prefix = `[fortnox/callback] ${outcome.toUpperCase()}`
  const ctx = businessId ? `business=${businessId}` : 'business=UNKNOWN'
  if (outcome === 'error') {
    console.error(`${prefix} ${ctx}: ${errorMessage}`)
  } else {
    console.log(`${prefix} ${ctx}`)
  }

  if (!businessId) return // fortnox_api_log.business_id är NOT NULL

  await logFortnoxApi({
    business_id: businessId,
    endpoint: 'oauth_callback',
    method: 'GET',
    status_code: statusCode,
    error_message: errorMessage,
    request_payload: metadata,
  })
}

/**
 * GET /api/integrations/fortnox/callback
 *
 * Tar emot ?code= från Fortnox och växlar mot tokens. Egen exchange (ej
 * lib/fortnox.exchangeCodeForTokens) eftersom vi behöver pinpoint matchning
 * mot redirect_uri som connect-routen använde.
 *
 * Sparar tokens via saveFortnoxTokens() vilken också sätter
 * fortnox_connected = true (v46).
 *
 * Varje fail-point loggas till fortnox_api_log med endpoint='oauth_callback'
 * + framgång loggas också, så vi kan se i DB om en business försökt koppla
 * (även om token-exchange failade och fortnox_connected fortfarande är false).
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const params = request.nextUrl.searchParams

  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('error')
  const errorDescription = params.get('error_description')

  // Extrahera businessId från state tidigt — så vi kan logga även OAuth-errors
  // där tokens aldrig sparas men användaren faktiskt försökte.
  const businessIdFromState: string | null = state ? (state.split(':')[0] || null) : null

  try {
    if (oauthError) {
      await logCallback(
        businessIdFromState,
        'error',
        `OAuth error from Fortnox: ${oauthError}${errorDescription ? ` — ${errorDescription}` : ''}`,
        null,
        { oauth_error: oauthError, oauth_error_description: errorDescription },
      )
      return NextResponse.redirect(
        redirectUrlFor(state, { fortnox: 'error', message: errorDescription || oauthError })
      )
    }

    if (!code || !state) {
      await logCallback(
        businessIdFromState,
        'error',
        `Missing required params: code=${!!code}, state=${!!state}`,
      )
      return NextResponse.redirect(
        redirectUrlFor(state, { fortnox: 'error', message: 'Missing code or state' })
      )
    }

    const storedState = cookieStore.get('fortnox_oauth_state')?.value
    if (!storedState || storedState !== state) {
      await logCallback(
        businessIdFromState,
        'error',
        `State mismatch — cookie ${storedState ? 'present but differs' : 'missing'}`,
        null,
        { cookie_present: !!storedState },
      )
      return NextResponse.redirect(
        redirectUrlFor(state, { fortnox: 'error', message: 'Ogiltig state — försök igen' })
      )
    }

    const businessId = businessIdFromState
    if (!businessId) {
      await logCallback(null, 'error', 'Invalid state format — no business_id')
      return NextResponse.redirect(
        redirectUrlFor(state, { fortnox: 'error', message: 'Invalid state format' })
      )
    }

    // Exchange code → tokens
    const clientId = process.env.FORTNOX_CLIENT_ID || 'HByzoLM8GB66'
    const clientSecret = process.env.FORTNOX_CLIENT_SECRET
    if (!clientSecret) {
      await logCallback(businessId, 'error', 'FORTNOX_CLIENT_SECRET missing in environment')
      return NextResponse.redirect(
        redirectUrlFor(state, { fortnox: 'error', message: 'FORTNOX_CLIENT_SECRET saknas i miljön' })
      )
    }

    const tokenRes = await fetch(`${FORTNOX_AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
      }).toString(),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      await logCallback(
        businessId,
        'error',
        `Token exchange failed: ${text.slice(0, 500)}`,
        tokenRes.status,
      )
      return NextResponse.redirect(
        redirectUrlFor(state, { fortnox: 'error', message: 'Token-utbyte misslyckades' })
      )
    }

    const tokens = await tokenRes.json()

    // Spara + slå upp företagsnamn
    await saveFortnoxTokens(businessId, tokens)
    const companyInfo = await getFortnoxCompanyInfo(businessId).catch(() => null)
    if (companyInfo?.CompanyName) {
      await saveFortnoxTokens(businessId, tokens, companyInfo.CompanyName)
    }

    cookieStore.delete('fortnox_oauth_state')

    await logCallback(businessId, 'success', null, 200, {
      company_name: companyInfo?.CompanyName || null,
      has_refresh_token: !!tokens.refresh_token,
    })

    return NextResponse.redirect(redirectUrlFor(state, { fortnox: 'connected' }))
  } catch (err: any) {
    await logCallback(
      businessIdFromState,
      'error',
      `Uncaught error: ${err?.message || 'unknown'}`,
      null,
      { stack: err?.stack?.slice(0, 1000) },
    )
    return NextResponse.redirect(
      redirectUrlFor(state, { fortnox: 'error', message: err?.message || 'Callback failed' })
    )
  }
}

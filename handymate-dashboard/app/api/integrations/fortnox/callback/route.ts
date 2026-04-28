import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { saveFortnoxTokens, getFortnoxCompanyInfo } from '@/lib/fortnox'

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

/**
 * GET /api/integrations/fortnox/callback
 *
 * Tar emot ?code= från Fortnox och växlar mot tokens. Egen exchange (ej
 * lib/fortnox.exchangeCodeForTokens) eftersom vi behöver pinpoint matchning
 * mot redirect_uri som connect-routen använde.
 *
 * Sparar tokens via saveFortnoxTokens() vilken också sätter
 * fortnox_connected = true (v46).
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const params = request.nextUrl.searchParams

    const code = params.get('code')
    const state = params.get('state')
    const oauthError = params.get('error')
    const errorDescription = params.get('error_description')

    if (oauthError) {
      console.error('[fortnox/callback] OAuth error:', oauthError, errorDescription)
      return NextResponse.redirect(
        settingsUrl({ fortnox: 'error', message: errorDescription || oauthError })
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        settingsUrl({ fortnox: 'error', message: 'Missing code or state' })
      )
    }

    const storedState = cookieStore.get('fortnox_oauth_state')?.value
    if (!storedState || storedState !== state) {
      console.error('[fortnox/callback] state mismatch')
      return NextResponse.redirect(
        settingsUrl({ fortnox: 'error', message: 'Ogiltig state — försök igen' })
      )
    }

    const [businessId] = state.split(':')
    if (!businessId) {
      return NextResponse.redirect(
        settingsUrl({ fortnox: 'error', message: 'Invalid state format' })
      )
    }

    // Exchange code → tokens
    const clientId = process.env.FORTNOX_CLIENT_ID || 'HByzoLM8GB66'
    const clientSecret = process.env.FORTNOX_CLIENT_SECRET
    if (!clientSecret) {
      return NextResponse.redirect(
        settingsUrl({ fortnox: 'error', message: 'FORTNOX_CLIENT_SECRET saknas i miljön' })
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
      console.error('[fortnox/callback] token exchange failed:', text)
      return NextResponse.redirect(
        settingsUrl({ fortnox: 'error', message: 'Token-utbyte misslyckades' })
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

    return NextResponse.redirect(settingsUrl({ fortnox: 'connected' }))
  } catch (err: any) {
    console.error('[fortnox/callback] error:', err)
    return NextResponse.redirect(
      settingsUrl({ fortnox: 'error', message: err?.message || 'Callback failed' })
    )
  }
}

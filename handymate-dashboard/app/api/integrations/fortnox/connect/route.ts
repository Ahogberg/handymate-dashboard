import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthenticatedBusiness } from '@/lib/auth'
import crypto from 'crypto'

const FORTNOX_AUTH_BASE = 'https://apps.fortnox.se/oauth-v1'
const FORTNOX_SCOPES =
  'invoice customer article payment bookkeeping settings companyinformation offer order project price time'

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  return `${appUrl}/api/integrations/fortnox/callback`
}

/**
 * GET /api/integrations/fortnox/connect
 * Startar OAuth-flödet. Sätter state-cookie och redirectar till Fortnox.
 *
 * Redirect URI är hård-kodad till `${APP_URL}/api/integrations/fortnox/callback`
 * för att inte krocka med ev. äldre `FORTNOX_REDIRECT_URI` env.
 *
 * State-format: `${business_id}:${random}` — callback verifierar mot cookie.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.redirect(
        new URL('/login?next=/dashboard/settings/integrations', request.url)
      )
    }

    const random = crypto.randomBytes(16).toString('hex')
    const state = `${business.business_id}:${random}`

    const cookieStore = await cookies()
    cookieStore.set('fortnox_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 min
      path: '/',
    })

    const params = new URLSearchParams({
      client_id: process.env.FORTNOX_CLIENT_ID || 'HByzoLM8GB66',
      redirect_uri: getRedirectUri(),
      scope: FORTNOX_SCOPES,
      state,
      response_type: 'code',
      access_type: 'offline',
    })

    return NextResponse.redirect(`${FORTNOX_AUTH_BASE}/auth?${params.toString()}`)
  } catch (err: any) {
    console.error('[fortnox/connect] error:', err)
    const url = new URL('/dashboard/settings/integrations', request.url)
    url.searchParams.set('fortnox', 'error')
    url.searchParams.set('message', err?.message || 'Kunde inte starta OAuth')
    return NextResponse.redirect(url)
  }
}

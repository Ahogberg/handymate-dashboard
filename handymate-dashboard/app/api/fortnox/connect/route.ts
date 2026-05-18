import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getFortnoxAuthUrl } from '@/lib/fortnox'

/**
 * GET /api/fortnox/connect
 * Initiate Fortnox OAuth flow.
 *
 * Auth via getAuthenticatedBusiness (lib/auth.ts) som hanterar både
 * Supabase v2-cookies (sb-{ref}-auth-token JSON-array) OCH impersonation
 * (hm_impersonate-cookie för superadmins). Tidigare läste denna route bara
 * sb-access-token / supabase-auth-token (v1-format) vilket inte fungerar
 * sedan Supabase v2-migrationen — alla användare fick login-redirect vid
 * klick på "Koppla Fortnox" oavsett session-status.
 *
 * State-format: `${business_id}:${random}` — callback verifierar mot cookie.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.redirect(
        new URL('/login?redirect=/dashboard/settings', request.url)
      )
    }

    const cookieStore = await cookies()

    // Generate state parameter (business_id + random string)
    const stateRandom = Math.random().toString(36).substring(2, 15)
    const state = `${business.business_id}:${stateRandom}`

    // Store state in cookie for verification
    cookieStore.set('fortnox_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
      path: '/',
    })

    // Redirect to Fortnox OAuth
    const authUrl = getFortnoxAuthUrl(state)
    return NextResponse.redirect(authUrl)

  } catch (error: unknown) {
    console.error('Fortnox connect error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to initiate Fortnox connection'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

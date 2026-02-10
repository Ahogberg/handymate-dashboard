import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getGoogleAuthUrl } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

/**
 * GET /api/google/connect
 * Initiate Google Calendar OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.redirect(new URL('/login?redirect=/dashboard/settings', request.url))
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.redirect(new URL('/login?redirect=/dashboard/settings', request.url))
    }

    // Generate state token with business_id, user_id and timestamp
    const state = Buffer.from(
      JSON.stringify({
        business_id: business.business_id,
        user_id: currentUser.id,
        timestamp: Date.now(),
      })
    ).toString('base64')

    // Generate Google OAuth URL
    const authUrl = getGoogleAuthUrl(state)

    return NextResponse.redirect(authUrl)
  } catch (error: unknown) {
    console.error('Google connect error:', error)
    return NextResponse.redirect(
      new URL('/dashboard/settings?tab=integrations&google=error', request.url)
    )
  }
}

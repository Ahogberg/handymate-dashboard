import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  saveFortnoxTokens,
  getFortnoxCompanyInfo
} from '@/lib/fortnox'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'

/**
 * GET /api/fortnox/callback
 * Handle Fortnox OAuth callback
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const searchParams = request.nextUrl.searchParams

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle OAuth errors
    if (error) {
      console.error('Fortnox OAuth error:', error, errorDescription)
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?fortnox=error&message=${encodeURIComponent(errorDescription || error)}`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?fortnox=error&message=${encodeURIComponent('Missing code or state')}`
      )
    }

    // Verify state parameter
    const storedState = cookieStore.get('fortnox_oauth_state')?.value

    if (!storedState || storedState !== state) {
      console.error('State mismatch:', { storedState, state })
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?fortnox=error&message=${encodeURIComponent('Invalid state parameter')}`
      )
    }

    // Extract business_id from state
    const [businessId] = state.split(':')

    if (!businessId) {
      return NextResponse.redirect(
        `${APP_URL}/dashboard/settings?fortnox=error&message=${encodeURIComponent('Invalid state format')}`
      )
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Save tokens to database
    await saveFortnoxTokens(businessId, tokens)

    // Get company info from Fortnox
    const companyInfo = await getFortnoxCompanyInfo(businessId)

    if (companyInfo?.CompanyName) {
      // Update with company name
      await saveFortnoxTokens(businessId, tokens, companyInfo.CompanyName)
    }

    // Clear the state cookie
    cookieStore.delete('fortnox_oauth_state')

    // Redirect to settings with success
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?fortnox=connected`
    )

  } catch (error: unknown) {
    console.error('Fortnox callback error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Callback failed'
    return NextResponse.redirect(
      `${APP_URL}/dashboard/settings?fortnox=error&message=${encodeURIComponent(errorMessage)}`
    )
  }
}

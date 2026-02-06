import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getFortnoxAuthUrl } from '@/lib/fortnox'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/fortnox/connect
 * Initiate Fortnox OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = getSupabase()

    // Get user from auth cookie
    const authCookie = cookieStore.get('sb-access-token')?.value ||
                       cookieStore.get('supabase-auth-token')?.value

    if (!authCookie) {
      return NextResponse.redirect(new URL('/login?redirect=/dashboard/settings', request.url))
    }

    // Parse the auth token to get user ID
    const { data: { user }, error: authError } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ).auth.getUser(authCookie)

    if (authError || !user) {
      return NextResponse.redirect(new URL('/login?redirect=/dashboard/settings', request.url))
    }

    // Get business_id for this user
    const { data: business, error: businessError } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Generate state parameter (business_id + random string)
    const stateRandom = Math.random().toString(36).substring(2, 15)
    const state = `${business.business_id}:${stateRandom}`

    // Store state in cookie for verification
    cookieStore.set('fortnox_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
      path: '/'
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

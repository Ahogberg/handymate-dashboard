import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getFortnoxConfig } from '@/lib/fortnox'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/fortnox/status
 * Get Fortnox connection status
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = getSupabase()

    // Get user from auth cookie
    const authCookie = cookieStore.get('sb-access-token')?.value ||
                       cookieStore.get('supabase-auth-token')?.value

    if (!authCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the auth token to get user ID
    const { data: { user }, error: authError } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ).auth.getUser(authCookie)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Get Fortnox config
    const config = await getFortnoxConfig(business.business_id)

    const connected = !!(config?.fortnox_access_token && config?.fortnox_connected_at)

    return NextResponse.json({
      connected,
      companyName: config?.fortnox_company_name || null,
      connectedAt: config?.fortnox_connected_at || null,
      expiresAt: config?.fortnox_token_expires_at || null
    })

  } catch (error: unknown) {
    console.error('Fortnox status error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get status'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

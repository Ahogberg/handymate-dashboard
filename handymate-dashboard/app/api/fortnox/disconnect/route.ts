import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { clearFortnoxConnection } from '@/lib/fortnox'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/fortnox/disconnect
 * Disconnect Fortnox integration
 */
export async function POST(request: NextRequest) {
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

    // Clear Fortnox connection
    await clearFortnoxConnection(business.business_id)

    return NextResponse.json({
      success: true,
      message: 'Fortnox disconnected successfully'
    })

  } catch (error: unknown) {
    console.error('Fortnox disconnect error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

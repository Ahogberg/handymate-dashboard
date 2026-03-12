import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/push/subscribe
 * Body: { endpoint, p256dh, auth }
 * Saves push subscription for the authenticated business user.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { endpoint, p256dh, auth } = await request.json()

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Upsert by endpoint (unique)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          id: `push_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          business_id: business.business_id,
          user_id: business.user_id || business.business_id,
          endpoint,
          p256dh,
          auth,
        },
        { onConflict: 'endpoint' }
      )

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('POST /api/push/subscribe error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

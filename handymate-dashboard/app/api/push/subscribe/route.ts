import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

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

    // Etapp 4-tillägg (multi-employee-parity-plan.md): user_id lagrades
    // tidigare från business.user_id, som ALLTID är ägarens auth-uuid
    // (getAuthenticatedBusiness returnerar samma business_config-rad
    // oavsett vem som loggat in, se lib/auth.ts) — en anställds egen
    // prenumeration stämplades alltså med ägarens uuid, vilket gjorde
    // riktad push (Etapp 4) till en no-op för alla utom ägaren. currentUser
    // ger den FAKTISKA inloggade personens auth-uuid. Fallback till
    // business.user_id bara om getCurrentUser undantagsvis missar (t.ex.
    // en inaktiverad business_users-rad) — hellre en fungerande
    // (om än fel-riktad) prenumeration än ingen alls.
    const currentUser = await getCurrentUser(request)
    const subscriberUserId = currentUser?.user_id || business.user_id || business.business_id

    // Upsert by endpoint (unique)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          id: `push_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          business_id: business.business_id,
          user_id: subscriberUserId,
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

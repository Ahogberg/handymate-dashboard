import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/push-tokens
 * Sparar Expo push-token per business + enhet.
 * Body: { token, platform, businessId? }
 *
 * Lager 3 (säkerhetsfix 2026-08-19, push_tokens.user_id): samma mönster
 * som app/api/push/subscribe/route.ts. business.user_id (från
 * getAuthenticatedBusiness) är ALLTID ägarens auth-uuid oavsett vem som
 * faktiskt är inloggad (business_config-raden är gemensam) — att spara
 * DEN som user_id hade tystat riktad push för varenda anställd. currentUser
 * (getCurrentUser) ger den faktiskt inloggade personens auth-uuid.
 * P1-4 (2026-09-01): registreringen är fail-closed. Om den faktiskt
 * inloggade business_users-raden inte kan verifieras sparas ingen token —
 * en anställds telefon får aldrig stämplas som ägarens.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token, platform } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token saknas' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser?.user_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          business_id: business.business_id,
          token,
          platform: platform || null,
          user_id: currentUser.user_id,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      )

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('POST /api/push-tokens error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * GET /api/push-tokens?businessId=xxx
 * Hämtar alla tokens för ett business (används vid push-utskick).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('push_tokens')
      .select('token, platform, last_used_at')
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error: any) {
    console.error('GET /api/push-tokens error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

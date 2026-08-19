import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { isUndefinedColumnError } from '@/lib/notifications/expo-push'

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
 * Fallback till business.user_id bara om getCurrentUser undantagsvis
 * missar (t.ex. en inaktiverad business_users-rad) — hellre en
 * fungerande (om än fel-riktad) token-rad än ingen alls.
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

    const currentUser = await getCurrentUser(request)
    const ownerUserId = currentUser?.user_id || business.user_id || null

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          business_id: business.business_id,
          token,
          platform: platform || null,
          user_id: ownerUserId,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      )

    if (error) {
      // sql/v159_push_tokens_user_id.sql (Andreas kör manuellt) kanske inte
      // körts än trots att koden är deployad — utan den här reserven skulle
      // VARJE token-registrering 500:a tills migrationen körs. Faller
      // tillbaka till samma upsert utan user_id (gammalt beteende).
      if (isUndefinedColumnError(error)) {
        console.warn('[push-tokens] push_tokens.user_id saknas ännu (sql/v159 ej körd) — registrerar utan user_id')
        const fallback = await supabase
          .from('push_tokens')
          .upsert(
            {
              business_id: business.business_id,
              token,
              platform: platform || null,
              last_used_at: new Date().toISOString(),
            },
            { onConflict: 'token' }
          )
        if (fallback.error) throw fallback.error
      } else {
        throw error
      }
    }

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

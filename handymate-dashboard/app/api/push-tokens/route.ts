import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/push-tokens
 * Sparar Expo push-token per business + enhet.
 * Body: { token, platform, businessId? }
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

    const { error } = await supabase
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

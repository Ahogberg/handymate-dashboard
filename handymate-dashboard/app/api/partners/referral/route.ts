import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { AGREEMENT_VERSION } from '@/lib/partners/agreement'

/**
 * POST /api/partners/referral
 * Partner-API för leadsbyrå-referrals.
 * Auth: Bearer PARTNER_API_KEY
 */
export async function POST(request: NextRequest) {
  try {
    // Validera API-nyckel
    const authHeader = request.headers.get('authorization')
    const partnerKey = process.env.PARTNER_API_KEY

    if (!partnerKey) {
      return NextResponse.json({ error: 'Partner API not configured' }, { status: 503 })
    }

    if (authHeader !== `Bearer ${partnerKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const referralCode = typeof body.referral_code === 'string'
      ? body.referral_code.trim().toUpperCase()
      : ''

    if (!/^P-[A-ZÅÄÖ0-9-]{3,28}$/.test(referralCode)) {
      return NextResponse.json(
        { error: 'En giltig referral_code krävs' },
        { status: 400 }
      )
    }

    const supabase = getServerSupabase()
    const { data: partner, error } = await supabase
      .from('partners')
      .select('id, referral_url, agreement_version')
      .eq('referral_code', referralCode)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      console.error('[Partner API] Partner lookup error:', error)
      return NextResponse.json({ error: 'Kunde inte kontrollera partnern' }, { status: 500 })
    }
    if (!partner || partner.agreement_version !== AGREEMENT_VERSION) {
      return NextResponse.json({ error: 'Partnern är inte aktiv på gällande avtal' }, { status: 409 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

    return NextResponse.json({
      // Ingen ekonomisk referral-rad skapas innan det finns ett verkligt
      // företag. Den atomiska claim-rutinen avgör attributionen vid signup.
      referral_url: partner.referral_url || `${appUrl}/registrera?ref=${encodeURIComponent(referralCode)}`,
      attribution_status: 'pending_signup',
    })
  } catch (error: any) {
    console.error('[Partner API] Error:', error)
    return NextResponse.json({ error: 'Kunde inte spåra referral' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

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

    const { partner_name, lead_email } = body

    if (!partner_name || !lead_email) {
      return NextResponse.json(
        { error: 'partner_name och lead_email krävs' },
        { status: 400 }
      )
    }

    const supabase = getServerSupabase()

    // Generera en unik referralkod för denna partner-referral
    const trackingId = `partner_${Math.random().toString(36).substring(2, 10)}`

    // Skapa referral-rad med partner-typ
    const { data: referral, error } = await supabase
      .from('referrals')
      .insert({
        referrer_business_id: 'PARTNER', // Speciell markör för partner-referrals
        referred_business_id: trackingId, // Temporärt — uppdateras vid registrering
        referred_email: lead_email,
        referrer_type: 'partner',
        partner_name,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Partner API] Insert error:', error)
      return NextResponse.json({ error: 'Kunde inte skapa referral' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

    return NextResponse.json({
      referral_url: `${appUrl}/registrera?ref=PARTNER&partner=${encodeURIComponent(partner_name)}&email=${encodeURIComponent(lead_email)}`,
      tracking_id: referral?.id || trackingId,
    })
  } catch (error: any) {
    console.error('[Partner API] Error:', error)
    return NextResponse.json({ error: 'Kunde inte spåra referral' }, { status: 500 })
  }
}

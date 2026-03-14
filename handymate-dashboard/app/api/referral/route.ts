import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateReferralCode } from '@/lib/referral/codes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral — Hämta eller generera referralkod
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()

    const { data: biz } = await supabase
      .from('business_config')
      .select('referral_code, business_name, business_id')
      .eq('business_id', business.business_id)
      .single()

    let code = biz?.referral_code

    if (!code) {
      code = await generateReferralCode(
        business.business_id,
        biz?.business_name || 'HMT'
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

    // Räkna referrals
    const { count: referralCount } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_business_id', business.business_id)

    return NextResponse.json({
      code,
      referral_url: `${appUrl}/registrera?ref=${code}`,
      referral_count: referralCount || 0,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral — Get or generate referral code for the business
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()

    const { data: biz } = await supabase
      .from('business_config')
      .select('referral_code, business_id')
      .eq('business_id', business.business_id)
      .single()

    let code = biz?.referral_code

    if (!code) {
      // Generate a unique code
      code = business.business_id.substring(0, 6).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase()

      await supabase
        .from('business_config')
        .update({ referral_code: code })
        .eq('business_id', business.business_id)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

    // Count successful referrals
    const { count: referralCount } = await supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_business_id', business.business_id)

    return NextResponse.json({
      code,
      referral_url: `${appUrl}/signup?ref=${code}`,
      referral_count: referralCount || 0,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

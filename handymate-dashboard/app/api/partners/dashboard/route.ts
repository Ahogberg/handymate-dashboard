import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/partners/dashboard
 * Returns partner stats, active referrals, and commission history.
 */
export async function GET(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const partner = await getPartnerFromToken(token)
  if (!partner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  // Fetch referrals for this partner
  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_business_id, referred_email, status, created_at, converted_at, commission_month, subscription_amount_sek, subscription_plan, partner_commission_sek')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })

  // Enrich with business info
  const enrichedReferrals = []
  for (const ref of referrals || []) {
    let businessName: string | null = null
    let plan: string | null = null

    if (ref.referred_business_id && ref.referred_business_id !== 'PARTNER') {
      const { data: biz } = await supabase
        .from('business_config')
        .select('company_name, plan')
        .eq('business_id', ref.referred_business_id)
        .maybeSingle()

      if (biz) {
        businessName = biz.company_name
        plan = biz.plan
      }
    }

    const commissionRate = partner.commission_rate || 0.20
    const amount = ref.subscription_amount_sek || 0
    const monthlyCommission = Math.round(amount * commissionRate)

    enrichedReferrals.push({
      id: ref.id,
      email: ref.referred_email,
      business_name: businessName,
      plan: plan || ref.subscription_plan,
      status: ref.status,
      created_at: ref.created_at,
      converted_at: ref.converted_at,
      commission_month: ref.commission_month || 0,
      monthly_commission: monthlyCommission,
    })
  }

  // Stats
  const totalReferred = enrichedReferrals.length
  const activeCustomers = enrichedReferrals.filter(r => r.status === 'active' || r.status === 'rewarded').length
  const pendingConversion = enrichedReferrals.filter(r => r.status === 'pending').length

  return NextResponse.json({
    partner: {
      id: partner.id,
      name: partner.name,
      company: partner.company,
      email: partner.email,
      referral_code: partner.referral_code,
      referral_url: partner.referral_url,
      commission_rate: partner.commission_rate,
      total_earned_sek: partner.total_earned_sek,
      total_pending_sek: partner.total_pending_sek,
    },
    stats: {
      total_referred: totalReferred,
      active_customers: activeCustomers,
      pending_conversion: pendingConversion,
      pending_commission_sek: partner.total_pending_sek,
      total_earned_sek: partner.total_earned_sek,
    },
    referrals: enrichedReferrals,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/partners/dashboard
 * Returns partner stats, referrals, events timeline, and webhook config.
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

  // Fetch full partner row (includes webhook + api_key fields)
  const { data: fullPartner } = await supabase
    .from('partners')
    .select('*')
    .eq('id', partner.id)
    .single()

  // Fetch referrals for this partner
  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_business_id, referred_email, status, created_at, converted_at, commission_month, subscription_amount_sek, subscription_plan, partner_commission_sek')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })

  // Fetch events for timeline
  const { data: events } = await supabase
    .from('partner_events')
    .select('*')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })
    .limit(100)

  // Enrich referrals with business info
  const enrichedReferrals = []
  for (const ref of referrals || []) {
    let businessName: string | null = null
    let plan: string | null = null
    let subscriptionStatus: string | null = null

    if (ref.referred_business_id && ref.referred_business_id !== 'PARTNER') {
      const { data: biz } = await supabase
        .from('business_config')
        .select('company_name, subscription_plan, subscription_status, created_at')
        .eq('business_id', ref.referred_business_id)
        .maybeSingle()

      if (biz) {
        businessName = biz.company_name
        plan = biz.subscription_plan
        subscriptionStatus = biz.subscription_status
      }
    }

    const commissionRate = partner.commission_rate || 0.20
    const amount = ref.subscription_amount_sek || 0
    const monthlyCommission = Math.round(amount * commissionRate)

    // Calculate total earned for this referral
    const months = ref.commission_month || 0
    const totalEarnedForRef = monthlyCommission * months

    enrichedReferrals.push({
      id: ref.id,
      email: ref.referred_email,
      business_name: businessName,
      plan: plan || ref.subscription_plan,
      subscription_status: subscriptionStatus,
      status: ref.status,
      created_at: ref.created_at,
      converted_at: ref.converted_at,
      commission_month: ref.commission_month || 0,
      monthly_commission: monthlyCommission,
      total_earned: totalEarnedForRef,
    })
  }

  // Stats
  const totalReferred = enrichedReferrals.length
  const activeCustomers = enrichedReferrals.filter(r => r.status === 'active' || r.status === 'rewarded').length
  const totalConverted = enrichedReferrals.filter(r => r.status !== 'pending').length

  // Calculate next payout (sum of monthly commissions for active referrals)
  const nextPayout = enrichedReferrals
    .filter(r => r.status === 'active')
    .reduce((sum, r) => sum + r.monthly_commission, 0)

  // Group events by business_id for timeline
  const eventsByBusiness: Record<string, NonNullable<typeof events>> = {}
  for (const evt of events || []) {
    const bizId = evt.business_id || 'unknown'
    if (!eventsByBusiness[bizId]) eventsByBusiness[bizId] = []
    eventsByBusiness[bizId]!.push(evt)
  }

  return NextResponse.json({
    partner: {
      id: partner.id,
      name: fullPartner?.name || partner.name,
      company: fullPartner?.company || partner.company,
      email: partner.email,
      referral_code: partner.referral_code,
      referral_url: partner.referral_url,
      commission_rate: partner.commission_rate,
      total_earned_sek: fullPartner?.total_earned_sek || partner.total_earned_sek,
      total_pending_sek: fullPartner?.total_pending_sek || partner.total_pending_sek,
      api_key: fullPartner?.api_key || null,
      webhook_url: fullPartner?.webhook_url || null,
      webhook_secret: fullPartner?.webhook_secret || null,
      webhook_events: fullPartner?.webhook_events || ['trial_started', 'converted', 'plan_upgraded', 'churned'],
    },
    stats: {
      total_referred: totalReferred,
      active_customers: activeCustomers,
      total_converted: totalConverted,
      pending_commission_sek: fullPartner?.total_pending_sek || partner.total_pending_sek,
      total_earned_sek: fullPartner?.total_earned_sek || partner.total_earned_sek,
      next_payout_sek: nextPayout,
    },
    referrals: enrichedReferrals,
    events: events || [],
    events_by_business: eventsByBusiness,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/billing - Hämta aktuell faktureringsstatus
 * Returnerar plan, användning, gränser, prenumerationsstatus och trialminfo
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Hämta business billing-data
    const { data: billingData, error: billingError } = await supabase
      .from('business_config')
      .select('billing_plan, billing_status, trial_ends_at, billing_period_start, billing_period_end, stripe_customer_id, stripe_subscription_id')
      .eq('business_id', businessId)
      .single()

    if (billingError) throw billingError

    const planId = billingData?.billing_plan || 'starter'

    // Hämta planens detaljer
    const { data: plan, error: planError } = await supabase
      .from('billing_plan')
      .select('*')
      .eq('plan_id', planId)
      .single()

    if (planError) throw planError

    // Hämta alla planer (för eventuell upgrade-jämförelse)
    const { data: allPlans, error: allPlansError } = await supabase
      .from('billing_plan')
      .select('*')
      .order('sort_order')

    if (allPlansError) throw allPlansError

    // Hämta aktuell periodens användning
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const { data: usage } = await supabase
      .from('usage_record')
      .select('sms_count, call_minutes, ai_requests, storage_mb, updated_at')
      .eq('business_id', businessId)
      .gte('period_start', periodStart.toISOString())
      .single()

    const currentUsage = {
      sms_count: usage?.sms_count || 0,
      call_minutes: usage?.call_minutes || 0,
      ai_requests: usage?.ai_requests || 0,
      storage_mb: usage?.storage_mb || 0
    }

    const limits = plan?.limits || {}

    // Beräkna trial-dagar kvar
    let trialDaysLeft = 0
    if (billingData?.billing_status === 'trialing' && billingData?.trial_ends_at) {
      const trialEnd = new Date(billingData.trial_ends_at)
      const diffMs = trialEnd.getTime() - now.getTime()
      trialDaysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    }

    return NextResponse.json({
      plan: {
        id: plan.plan_id,
        name: plan.name,
        price_sek: plan.price_sek,
        features: plan.features,
        limits: plan.limits
      },
      subscription: {
        status: billingData?.billing_status || 'trialing',
        stripe_customer_id: billingData?.stripe_customer_id || null,
        stripe_subscription_id: billingData?.stripe_subscription_id || null,
        period_start: billingData?.billing_period_start || null,
        period_end: billingData?.billing_period_end || null
      },
      trial: {
        is_trialing: billingData?.billing_status === 'trialing',
        ends_at: billingData?.trial_ends_at || null,
        days_left: trialDaysLeft
      },
      usage: {
        current: currentUsage,
        limits: {
          sms_per_month: limits.sms_per_month || 0,
          call_minutes_per_month: limits.call_minutes_per_month || 0,
          ai_requests_per_month: limits.ai_requests_per_month || 0,
          storage_gb: limits.storage_gb || 0
        },
        percentages: {
          sms: limits.sms_per_month ? Math.round((currentUsage.sms_count / limits.sms_per_month) * 100) : 0,
          call_minutes: limits.call_minutes_per_month ? Math.round((currentUsage.call_minutes / limits.call_minutes_per_month) * 100) : 0,
          ai_requests: limits.ai_requests_per_month ? Math.round((currentUsage.ai_requests / limits.ai_requests_per_month) * 100) : 0,
          storage: limits.storage_gb ? Math.round((currentUsage.storage_mb / (limits.storage_gb * 1024)) * 100) : 0
        }
      },
      all_plans: allPlans
    })
  } catch (error: any) {
    console.error('Get billing status error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

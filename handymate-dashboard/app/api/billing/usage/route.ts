import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/billing/usage - Hämta aktuell periodens användning
 * Returnerar användning jämfört med planens gränser.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Hämta aktuell plan
    const { data: billingData, error: billingError } = await supabase
      .from('business_config')
      .select('subscription_plan, billing_period_start, billing_period_end')
      .eq('business_id', businessId)
      .single()

    if (billingError) throw billingError

    const planId = billingData?.subscription_plan || 'starter'

    // Hämta planens gränser
    const { data: plan, error: planError } = await supabase
      .from('billing_plan')
      .select('limits')
      .eq('plan_id', planId)
      .single()

    if (planError) throw planError

    const limits = plan?.limits || {}

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

    // Beräkna dagar kvar i perioden
    const periodEnd = billingData?.billing_period_end
      ? new Date(billingData.billing_period_end)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

    return NextResponse.json({
      period: {
        start: billingData?.billing_period_start || periodStart.toISOString(),
        end: billingData?.billing_period_end || periodEnd.toISOString(),
        days_left: daysLeft
      },
      usage: {
        sms: {
          current: currentUsage.sms_count,
          limit: limits.sms_per_month || 0,
          remaining: Math.max(0, (limits.sms_per_month || 0) - currentUsage.sms_count),
          percentage: limits.sms_per_month ? Math.round((currentUsage.sms_count / limits.sms_per_month) * 100) : 0
        },
        call_minutes: {
          current: currentUsage.call_minutes,
          limit: limits.call_minutes_per_month || 0,
          remaining: Math.max(0, (limits.call_minutes_per_month || 0) - currentUsage.call_minutes),
          percentage: limits.call_minutes_per_month ? Math.round((currentUsage.call_minutes / limits.call_minutes_per_month) * 100) : 0
        },
        ai_requests: {
          current: currentUsage.ai_requests,
          limit: limits.ai_requests_per_month || 0,
          remaining: Math.max(0, (limits.ai_requests_per_month || 0) - currentUsage.ai_requests),
          percentage: limits.ai_requests_per_month ? Math.round((currentUsage.ai_requests / limits.ai_requests_per_month) * 100) : 0
        },
        storage: {
          current_mb: currentUsage.storage_mb,
          limit_gb: limits.storage_gb || 0,
          remaining_mb: Math.max(0, ((limits.storage_gb || 0) * 1024) - currentUsage.storage_mb),
          percentage: limits.storage_gb ? Math.round((currentUsage.storage_mb / (limits.storage_gb * 1024)) * 100) : 0
        }
      },
      last_updated: usage?.updated_at || null
    })
  } catch (error: any) {
    console.error('Get billing usage error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

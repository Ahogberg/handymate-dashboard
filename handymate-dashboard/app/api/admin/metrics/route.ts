import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'

const PLAN_PRICES: Record<string, number> = {
  starter: 2495,
  professional: 5995,
  business: 11995,
}

/**
 * GET /api/admin/metrics
 * Returns aggregate platform metrics for the admin dashboard
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

    const supabase = getAdminSupabase()

    // Current month boundaries
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

    // --- Run all queries in parallel ---
    const [
      allBusinessesRes,
      totalQuotesRes,
      totalInvoicesRes,
      totalCallsRes,
      smsThisMonthRes,
      billingPlansRes,
    ] = await Promise.all([
      // All businesses with billing info
      supabase
        .from('business_config')
        .select('business_id, business_name, subscription_plan, subscription_status, created_at'),

      // Total quotes
      supabase
        .from('quotes')
        .select('quote_id', { count: 'exact', head: true }),

      // Total invoices
      supabase
        .from('invoice')
        .select('invoice_id', { count: 'exact', head: true }),

      // Total calls
      supabase
        .from('call_recording')
        .select('recording_id', { count: 'exact', head: true }),

      // SMS this month
      supabase
        .from('sms_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),

      // Billing plan definitions (for price lookup fallback)
      supabase
        .from('billing_plan')
        .select('plan_id, name, price_sek'),
    ])

    // --- Process businesses ---
    const businesses = allBusinessesRes.data || []
    const total_businesses = businesses.length

    // Determine effective status and plan for each business
    const enriched = businesses.map((b: any) => {
      const status = b.subscription_status || 'unknown'
      const plan = b.subscription_plan || 'starter'
      return { ...b, effective_status: status, effective_plan: plan }
    })

    const active_businesses = enriched.filter(
      (b: any) => b.effective_status === 'active' || b.effective_status === 'trialing' || b.effective_status === 'trial'
    ).length

    // Build a price map from DB billing_plan table, with fallback to hardcoded
    const planPriceMap: Record<string, number> = { ...PLAN_PRICES }
    if (billingPlansRes.data) {
      for (const p of billingPlansRes.data) {
        planPriceMap[p.plan_id] = p.price_sek
      }
    }

    // Monthly recurring revenue from active/trialing businesses
    const total_revenue_sek = enriched
      .filter((b: any) => b.effective_status === 'active' || b.effective_status === 'trialing' || b.effective_status === 'trial')
      .reduce((sum: number, b: any) => {
        return sum + (planPriceMap[b.effective_plan] || 0)
      }, 0)

    // New this month
    const new_this_month = businesses.filter(
      (b: any) => b.created_at && b.created_at >= monthStart && b.created_at <= monthEnd
    ).length

    // Churn this month: subscription_status = 'cancelled' with cancellation happening this month
    // Since we don't have a cancelled_at column, we count all currently cancelled businesses
    // that were created before this month (approximation). A more precise approach would
    // require a billing_event table query.
    const churn_this_month = enriched.filter(
      (b: any) => b.effective_status === 'cancelled'
    ).length

    // Plan distribution
    const plan_distribution: Record<string, number> = { starter: 0, professional: 0, business: 0 }
    for (const b of enriched) {
      const plan = b.effective_plan
      if (plan in plan_distribution) {
        plan_distribution[plan]++
      } else {
        plan_distribution[plan] = (plan_distribution[plan] || 0) + 1
      }
    }

    // Recent signups (last 10)
    const sortedBusinesses = [...businesses].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const recent_signups = sortedBusinesses.slice(0, 10).map((b: any) => ({
      business_name: b.business_name,
      created_at: b.created_at,
      subscription_plan: b.subscription_plan || 'starter',
    }))

    return NextResponse.json({
      total_businesses,
      active_businesses,
      total_revenue_sek,
      new_this_month,
      churn_this_month,
      total_quotes: totalQuotesRes.count || 0,
      total_invoices: totalInvoicesRes.count || 0,
      total_calls: totalCallsRes.count || 0,
      sms_this_month: smsThisMonthRes.count || 0,
      plan_distribution,
      recent_signups,
    })
  } catch (error: any) {
    console.error('Admin metrics error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}

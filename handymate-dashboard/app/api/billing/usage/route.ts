import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

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

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare eller administratör' }, { status: 403 })
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

    // ═══ FÖRBRUKNINGSSIFFRORNA ÄR BORTTAGNA (2026-08-08) ═══
    //
    // Rutten läste usage_record, som aldrig fylldes — incrementUsage() hade
    // noll callsites. Varje kund fick alltså 0 förbrukning och 0 % oavsett
    // hur mycket de faktiskt använt, och billing-sidan visade det som en
    // sanning. En tom yta är bättre än en falsk siffra.
    //
    // Rutten BEHÅLLS med sin rollgrind (tests/permission-contract.spec.ts
    // refererar den) och returnerar periodinformationen, som är sann.
    //
    // Var kvot och kostnad bor nu:
    //   kundvänd SMS-kvot  → /api/sms/usage (sms_usage) — sann i dag
    //   vår kostnad (COGS) → lib/costs/report.ts (cost_event) — bara internt
    // Se sql/v100_cogs_matare.sql för hela ägarskapsgränsen.
    //
    // Kundvända gränser för samtal och AI, med möjlighet att fylla på, är
    // planerade — men de kräver en sann källa först (samtalsminuter mäts
    // ännu inte) och en enhet kunden förstår.
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)

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
      // Planens gränser är sanna och får visas. Förbrukningen gör det inte —
      // se kommentaren ovan. Klienten ska läsa /api/sms/usage för den enda
      // förbrukningssiffra som i dag går att lita på.
      limits: {
        sms_per_month: limits.sms_per_month || 0,
        call_minutes_per_month: limits.call_minutes_per_month || 0,
        ai_requests_per_month: limits.ai_requests_per_month || 0,
        storage_gb: limits.storage_gb || 0
      },
      usage_measurement: {
        available: false,
        reason: 'Förbrukning per kund mäts inte ännu för samtal och AI.',
        sms_source: '/api/sms/usage'
      }
    })
  } catch (error: any) {
    console.error('Get billing usage error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

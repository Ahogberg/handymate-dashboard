import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { isFoundersOfferAvailable } from '@/lib/billing/founders-offer'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing - Hämta aktuell faktureringsstatus
 * Returnerar plan, användning, gränser, prenumerationsstatus och trialminfo
 *
 * Rollskydd: ENDAST owner/admin. Fakturering är ägar-/admin-data.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (currentUser?.role !== 'owner' && currentUser?.role !== 'admin') {
      return NextResponse.json({ error: 'Endast ägare/admin' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Hämta business billing-data
    const { data: billingData, error: billingError } = await supabase
      .from('business_config')
      .select('subscription_plan, subscription_status, trial_ends_at, billing_period_start, billing_period_end, stripe_customer_id, stripe_subscription_id')
      .eq('business_id', businessId)
      .single()

    if (billingError) throw billingError

    const planId = billingData?.subscription_plan || 'starter'

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

    // ═══ FÖRBRUKNINGSBLOCKET ÄR BORTTAGET (2026-08-08) ═══
    //
    // Läste usage_record, som aldrig fylldes: incrementUsage() hade noll
    // callsites, så sms_count/call_minutes/ai_requests var alltid 0. Rutten
    // rapporterade alltså 0 % förbrukning för varje kund, varje månad, medan
    // billing-sidan visade det som en sanning.
    //
    // Kvot som kunden SKA se bor i sms_usage (/api/sms/usage) och är sann.
    // Vår kostnad bor i cost_event (lib/costs/report.ts) och visas bara
    // internt. Se sql/v100_cogs_matare.sql för ägarskapsgränsen.
    //
    // Kundvända gränser för samtal och AI kommer tillbaka när de har en sann
    // källa — inte innan.
    const now = new Date()

    // Beräkna trial-dagar kvar
    let trialDaysLeft = 0
    if (billingData?.subscription_status === 'trialing' && billingData?.trial_ends_at) {
      const trialEnd = new Date(billingData.trial_ends_at)
      const diffMs = trialEnd.getTime() - now.getTime()
      trialDaysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
    }

    // Lanseringserbjudandet "Grundarkunderna" (Andreas-beslut 2026-08-19):
    // billing-sidan har ingen egen naturlig källa för detta — återanvänder
    // GET /api/billing (redan anropad av sidan vid load) i stället för en
    // ny fetch. Server-härlett, se lib/billing/founders-offer.ts.
    const foundersAvailable = await isFoundersOfferAvailable(supabase)

    return NextResponse.json({
      plan: {
        id: plan.plan_id,
        name: plan.name,
        price_sek: plan.price_sek,
        features: plan.features,
        limits: plan.limits
      },
      founders_available: foundersAvailable,
      subscription: {
        status: billingData?.subscription_status || 'trialing',
        stripe_customer_id: billingData?.stripe_customer_id || null,
        stripe_subscription_id: billingData?.stripe_subscription_id || null,
        period_start: billingData?.billing_period_start || null,
        period_end: billingData?.billing_period_end || null
      },
      trial: {
        is_trialing: billingData?.subscription_status === 'trialing',
        ends_at: billingData?.trial_ends_at || null,
        days_left: trialDaysLeft
      },
      all_plans: allPlans
    })
  } catch (error: any) {
    console.error('Get billing status error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

// Årsavtal (Andreas-beslut 2026-08-19). Whitelist — allt annat är 400.
const ALLOWED_INTERVALS = ['monthly', 'yearly'] as const
type BillingInterval = (typeof ALLOWED_INTERVALS)[number]

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover' as any,
  })
}

/**
 * POST /api/billing/onboarding-checkout — Stripe Checkout för ONBOARDING.
 *
 * INGEN provperiod — kunden DEBITERAS DIREKT. Handymates modell är betala-direkt
 * med en pengarna-tillbaka-garanti som trygghet, inte en trial. Checkouten skapar
 * en prenumeration som blir `active` med en gång och drar kortet omedelbart.
 * Detta ERSÄTTER det tidigare setup-intent/confirm-flödet som bara satte
 * `subscription_status:'trialing'` i vår databas UTAN att någonsin skapa en
 * Stripe-prenumeration → kunden debiterades aldrig (intäktsblocker).
 *
 * Skillnad mot /api/billing/checkout (uppgradering i Inställningar):
 *  - `metadata.onboarding: 'true'` → webhooken (handleCheckoutCompleted)
 *    provisionerar telefonnummer efter genomförd checkout.
 *  - success_url/cancel_url pekar tillbaka in i onboarding-flödet.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stripe = getStripe()
    const supabase = getServerSupabase()
    const { planId, interval: rawInterval } = await request.json()

    if (!planId) {
      return NextResponse.json({ error: 'Missing planId' }, { status: 400 })
    }

    // Default 'monthly' — befintliga anrop utan `interval` beter sig exakt
    // som förut. Whitelist: allt annat än monthly/yearly är 400, aldrig en
    // tyst fallback.
    const interval: BillingInterval = rawInterval ?? 'monthly'
    if (!ALLOWED_INTERVALS.includes(interval)) {
      return NextResponse.json({ error: 'Ogiltigt faktureringsintervall' }, { status: 400 })
    }

    // Hämta planens Stripe price ID. Årsvis (Andreas-beslut 2026-08-19,
    // "betala för 10, få 12"): priset bor på en SEPARAT billing_plan-rad
    // (t.ex. professional_yearly, se sql/v156_billing_yearly.sql) — men
    // metadata.plan_id som skickas till Stripe/webhooken nedan förblir
    // ALLTID basplanen (planId). business_config.subscription_plan läses
    // som PlanType på 40+ ställen i kodbasen (feature-gates, SMS-kvoter,
    // agentgrindar m.m.) — att skriva 'professional_yearly' dit hade
    // fail-closed nollat allt det för varje årskund.
    const priceLookupId = interval === 'yearly' ? `${planId}_yearly` : planId

    const { data: plan, error: planError } = await supabase
      .from('billing_plan')
      .select('plan_id, name, price_sek, stripe_price_id')
      .eq('plan_id', priceLookupId)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (!plan.stripe_price_id) {
      // Fail-closed: aldrig tyst fallback till månadspris/fel pris. Årsraden
      // finns (INSERT:ad av v156) men saknar stripe_price_id tills Andreas
      // klistrat in det riktiga priset från Stripe Dashboard.
      const message = interval === 'yearly'
        ? 'Årsbetalning är inte aktiverad ännu — välj månadsvis.'
        : 'Plan saknar Stripe-pris'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    // Hämta eller skapa Stripe customer (samma logik som /api/billing/checkout)
    const { data: billingData } = await supabase
      .from('business_config')
      .select('stripe_customer_id')
      .eq('business_id', business.business_id)
      .single()

    let stripeCustomerId = billingData?.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: business.contact_email ?? undefined,
        name: business.business_name ?? undefined,
        metadata: {
          business_id: business.business_id,
          handymate_plan: planId,
        },
      })

      stripeCustomerId = customer.id

      await supabase
        .from('business_config')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('business_id', business.business_id)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.handymate.se'

    // Skapa Stripe Checkout-session — INGEN provperiod, debiteras direkt.
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      locale: 'sv',
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      // Tillbaka in i onboarding-flödet. page.tsx läser ?payment=success och
      // går vidare till importsteget; ?payment=cancelled → kvar på
      // betalsteget så kunden kan försöka igen.
      success_url: `${appUrl}/onboarding?payment=success&plan=${planId}`,
      cancel_url: `${appUrl}/onboarding?payment=cancelled`,
      metadata: {
        business_id: business.business_id,
        plan_id: planId,
        onboarding: 'true',
        billing_interval: interval,
      },
      subscription_data: {
        metadata: {
          business_id: business.business_id,
          plan_id: planId,
          onboarding: 'true',
          billing_interval: interval,
        },
      },
      allow_promotion_codes: true,
      tax_id_collection: {
        enabled: true,
      },
      // Krävs av Stripe när tax_id_collection aktiveras för en BEFINTLIG
      // customer — annars kastar Stripe ett fel vid session-skapandet.
      customer_update: {
        name: 'auto',
        address: 'auto',
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[billing/onboarding-checkout] Error:', error)
    return NextResponse.json(
      { error: 'Något gick fel med betalningen — försök igen om en stund.' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import Stripe from 'stripe'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover' as any
  })
}

/**
 * POST /api/billing/checkout - Skapa Stripe Checkout-session
 * Skapar en checkout-session för att byta eller starta en prenumeration.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stripe = getStripe()
    const supabase = getServerSupabase()
    const { planId } = await request.json()

    if (!planId) {
      return NextResponse.json({ error: 'Missing planId' }, { status: 400 })
    }

    // Hämta planens Stripe price ID
    const { data: plan, error: planError } = await supabase
      .from('billing_plan')
      .select('plan_id, name, price_sek, stripe_price_id')
      .eq('plan_id', planId)
      .single()

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    if (!plan.stripe_price_id) {
      return NextResponse.json({ error: 'Plan has no Stripe price configured' }, { status: 400 })
    }

    // Hämta eller skapa Stripe customer
    const { data: billingData } = await supabase
      .from('business_config')
      .select('stripe_customer_id, billing_plan')
      .eq('business_id', business.business_id)
      .single()

    let stripeCustomerId = billingData?.stripe_customer_id

    if (!stripeCustomerId) {
      // Skapa ny Stripe-kund
      const customer = await stripe.customers.create({
        email: business.contact_email || undefined,
        name: business.business_name || undefined,
        metadata: {
          business_id: business.business_id,
          handymate_plan: planId
        }
      })

      stripeCustomerId = customer.id

      // Spara Stripe customer ID
      await supabase
        .from('business_config')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('business_id', business.business_id)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Skapa Stripe Checkout-session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      locale: 'sv',
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1
        }
      ],
      success_url: `${appUrl}/dashboard/settings?billing=success&plan=${planId}`,
      cancel_url: `${appUrl}/dashboard/settings?billing=cancelled`,
      metadata: {
        business_id: business.business_id,
        plan_id: planId
      },
      subscription_data: {
        metadata: {
          business_id: business.business_id,
          plan_id: planId
        }
      },
      // Tillåt kampanjkoder
      allow_promotion_codes: true,
      // Fakturainställningar för svenska företag
      tax_id_collection: {
        enabled: true
      }
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Create checkout session error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

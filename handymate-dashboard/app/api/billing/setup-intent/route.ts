import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-01-28.clover' as any })
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { planId } = await request.json()
    if (!planId) return NextResponse.json({ error: 'Missing planId' }, { status: 400 })

    const stripe = getStripe()
    const supabase = getServerSupabase()

    const { data: plan } = await supabase
      .from('billing_plan')
      .select('plan_id, name, price_sek, stripe_price_id')
      .eq('plan_id', planId)
      .single()

    if (!plan?.stripe_price_id) {
      return NextResponse.json({ error: 'Plan saknar Stripe-pris' }, { status: 400 })
    }

    // Hämta eller skapa Stripe customer
    let stripeCustomerId = (business as any).stripe_customer_id
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: business.contact_email || undefined,
        name: business.business_name || undefined,
        metadata: { business_id: business.business_id },
      })
      stripeCustomerId = customer.id
      await supabase
        .from('business_config')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('business_id', business.business_id)
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      metadata: {
        business_id: business.business_id,
        plan_id: planId,
        price_id: plan.stripe_price_id,
      },
    })

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      planName: plan.name,
      planPrice: plan.price_sek,
    })
  } catch (error: any) {
    console.error('[setup-intent] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

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

// Leads addon priser (Stripe Price IDs sätts i env)
const ADDON_PRICES: Record<string, { price: number; quota: number; envKey: string }> = {
  starter: { price: 499, quota: 20, envKey: 'STRIPE_LEADS_STARTER_PRICE_ID' },
  pro: { price: 999, quota: 50, envKey: 'STRIPE_LEADS_PRO_PRICE_ID' },
}

/**
 * POST /api/billing/leads-addon — Aktivera/uppgradera Leads add-on via Stripe
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const stripe = getStripe()
    const supabase = getServerSupabase()
    const { tier, action } = await request.json()

    // Avsluta addon
    if (action === 'cancel') {
      await supabase
        .from('business_config')
        .update({ leads_addon: false, leads_addon_tier: null })
        .eq('business_id', business.business_id)
      return NextResponse.json({ success: true, message: 'Leads add-on avslutad' })
    }

    if (!tier || !ADDON_PRICES[tier]) {
      return NextResponse.json({ error: 'Ogiltig plan' }, { status: 400 })
    }

    const addonConfig = ADDON_PRICES[tier]
    const stripePriceId = process.env[addonConfig.envKey]

    // Om Stripe Price ID finns → skapa checkout session
    if (stripePriceId) {
      // Hämta eller skapa Stripe customer
      const { data: config } = await supabase
        .from('business_config')
        .select('stripe_customer_id, contact_email, business_name')
        .eq('business_id', business.business_id)
        .single()

      let customerId = config?.stripe_customer_id

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: config?.contact_email || undefined,
          name: config?.business_name || undefined,
          metadata: { business_id: business.business_id },
        })
        customerId = customer.id
        await supabase
          .from('business_config')
          .update({ stripe_customer_id: customerId })
          .eq('business_id', business.business_id)
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        metadata: {
          business_id: business.business_id,
          addon: 'leads',
          tier,
        },
        subscription_data: {
          metadata: {
            business_id: business.business_id,
            addon: 'leads',
            tier,
          },
        },
        success_url: `${appUrl}/dashboard/marketing/leads?activated=true`,
        cancel_url: `${appUrl}/dashboard/marketing/leads`,
      })

      return NextResponse.json({ checkout_url: session.url })
    }

    // Fallback: aktivera direkt utan Stripe (dev/test)
    await supabase
      .from('business_config')
      .update({
        leads_addon: true,
        leads_addon_tier: tier,
      })
      .eq('business_id', business.business_id)

    return NextResponse.json({
      success: true,
      message: `Leads ${tier} aktiverad`,
      redirect: '/dashboard/marketing/leads',
    })
  } catch (error: any) {
    console.error('Leads addon error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { createSubscriptionCheckout, CheckoutConflict } from '@/lib/billing/checkout-session'
import { cancelLeadsSubscriptions } from '@/lib/billing/leads-subscription'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import Stripe from 'stripe'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'

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

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare eller administratör' }, { status: 403 })
    }

    const stripe = getStripe()
    const supabase = getServerSupabase()
    const { tier, action } = await request.json()

    // Avsluta addon
    if (action === 'cancel') {
      const { data: config, error } = await supabase.from('business_config')
        .select('stripe_customer_id').eq('business_id', business.business_id).single()
      if (error || !config) throw new Error('Betalningskontot kunde inte läsas')
      if (!config.stripe_customer_id) return NextResponse.json({ error: 'Inget Stripe-konto är kopplat. Kontakta support.' }, { status: 409 })
      await cancelLeadsSubscriptions(supabase, stripe, business.business_id, config.stripe_customer_id)
      return NextResponse.json({ success: true, message: 'Leads add-on avslutad' })
    }

    if (!tier || !ADDON_PRICES[tier]) {
      return NextResponse.json({ error: 'Ogiltig plan' }, { status: 400 })
    }

    const addonConfig = ADDON_PRICES[tier]
    const stripePriceId = process.env[addonConfig.envKey]

    // Om Stripe Price ID finns → skapa checkout session
    if (stripePriceId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

      const session = await createSubscriptionCheckout(supabase, stripe, business.business_id, {
        mode: 'subscription',
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
      }, 'leads')

      return NextResponse.json({ checkout_url: session.url })
    }

    return NextResponse.json({ error: 'Leads-tillägget är inte tillgängligt för köp ännu.' }, { status: 503 })
  } catch (error: any) {
    if (error instanceof CheckoutConflict) return NextResponse.json({ error: error.message }, { status: 409 })
    console.error('Leads addon error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

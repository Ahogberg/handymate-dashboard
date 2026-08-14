import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import Stripe from 'stripe'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { fuelBudgetOreForPlan } from '@/lib/costs/fuel'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-01-28.clover' as any })
}

/**
 * POST /api/billing/fuel-topup — köp en påfyllning av Bränsle-budgeten.
 *
 * Engångsbetalning (mode: 'payment'), inte en prenumeration — mirrors
 * app/api/billing/leads-addon/route.ts:s Stripe-mönster men med price_data
 * inline i stället för en förskapad Stripe Price (ingen ny produkt behöver
 * skapas i Stripe-dashboarden för att skeppa detta).
 *
 * Ingen tier-väljare i UI (designen har en enda knapp): default-beloppet är
 * en hel månadsbudget för kundens plan ("fyll på en månads värde bränsle").
 * amountOre kan skickas explicit i body för en framtida beloppsväljare utan
 * att routen behöver ändras.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare eller administratör' }, { status: 403 })
    }

    const stripe = getStripe()
    const supabase = getServerSupabase()
    const body = await request.json().catch(() => ({}))

    const { data: config } = await supabase
      .from('business_config')
      .select('stripe_customer_id, contact_email, business_name, subscription_plan')
      .eq('business_id', business.business_id)
      .single()

    const amountOre = Number.isFinite(body?.amountOre) && body.amountOre > 0
      ? Math.round(body.amountOre)
      : fuelBudgetOreForPlan(config?.subscription_plan ?? null)

    let customerId = config?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: config?.contact_email || undefined,
        name: config?.business_name || undefined,
        metadata: { business_id: business.business_id },
      })
      customerId = customer.id
      await supabase.from('business_config').update({ stripe_customer_id: customerId }).eq('business_id', business.business_id)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'sek',
          product_data: { name: 'Handymate Bränsle-påfyllning' },
          unit_amount: amountOre, // öre — Stripes minsta enhet för SEK.
        },
        quantity: 1,
      }],
      metadata: {
        business_id: business.business_id,
        addon: 'fuel_topup',
        amount_ore: String(amountOre),
      },
      success_url: `${appUrl}/dashboard/settings/billing?fuel_topup=success`,
      cancel_url: `${appUrl}/dashboard/settings/billing`,
    })

    return NextResponse.json({ checkout_url: session.url })
  } catch (error: any) {
    console.error('Fuel topup error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

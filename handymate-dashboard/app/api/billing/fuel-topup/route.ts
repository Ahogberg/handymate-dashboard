import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import Stripe from 'stripe'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { resolveFuelTopupOption } from '@/lib/costs/fuel'

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
 * Klienten skickar ENDAST ett tillåtet tier-id (quarter|half|full). Beloppet
 * härleds server-side ur den aktiva planens Bränslenivå — ett godtyckligt
 * amountOre från klienten accepteras aldrig.
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

    const { data: config, error: configError } = await supabase
      .from('business_config')
      .select('stripe_customer_id, contact_email, business_name, subscription_plan')
      .eq('business_id', business.business_id)
      .single()

    if (configError || !config) {
      return NextResponse.json({ error: 'Aktiv prisplan kunde inte verifieras' }, { status: 503 })
    }

    // `full` är bakåtkompatibel default för redan utrullade klienter som
    // ännu inte skickar tier. Alla uttryckliga värden måste whitelistas.
    const requestedTier = body?.tier == null ? 'full' : String(body.tier)
    const topup = resolveFuelTopupOption(config.subscription_plan, requestedTier)
    if (!topup) {
      return NextResponse.json({ error: 'Ogiltig påfyllningsnivå' }, { status: 400 })
    }
    const amountOre = topup.amountOre

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
          product_data: { name: `Handymate Bränsle — ${topup.label}` },
          unit_amount: amountOre, // öre — Stripes minsta enhet för SEK.
        },
        quantity: 1,
      }],
      metadata: {
        business_id: business.business_id,
        addon: 'fuel_topup',
        amount_ore: String(amountOre),
        fuel_tier: topup.id,
        fuel_percent: String(topup.percent),
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

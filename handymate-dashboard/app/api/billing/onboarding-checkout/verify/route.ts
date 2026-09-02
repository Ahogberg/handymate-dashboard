import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { writeBillingUpdate, byggAbonnemangsfalt } from '@/lib/billing/write-billing-update'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover' as any,
  })
}

/**
 * POST /api/billing/onboarding-checkout/verify — { session_id }
 *
 * Onboardingen litade tidigare på `?payment=success` i URL:en: kunden (eller
 * vem som helst) kunde skriva in den för hand och hoppa förbi betalsteget.
 * Nu frågar klienten Stripe via den här rutten i stället.
 *
 * Fyra villkor, alla måste hålla:
 *   1. sessionen tillhör det INLOGGADE företaget (metadata.business_id)
 *   2. det är onboarding-checkouten (metadata.onboarding === 'true') — en
 *      addon-session (bränsle/leads) får aldrig aktivera en prenumeration
 *   3. payment_status === 'paid'
 *   4. status === 'complete'
 *
 * Skriver samma fält som webhooken via den delade
 * lib/billing/write-billing-update.ts (idempotent update — kör webhooken
 * först eller sist spelar ingen roll). Telefonprovisioneringen ligger kvar
 * i webhooken: den ska ske exakt en gång och har ingen brådska här.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { session_id: sessionId } = await request.json().catch(() => ({ session_id: null }))
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'Saknar session_id' }, { status: 400 })
    }

    const stripe = getStripe()
    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
    } catch (err) {
      console.warn('[onboarding verify] sessionen kunde inte hämtas:', err)
      return NextResponse.json({ paid: false, error: 'Betalningen kunde inte verifieras' }, { status: 400 })
    }

    if (session.metadata?.business_id !== business.business_id) {
      // Någon annans session — säg inget om den, bara nej.
      return NextResponse.json({ paid: false, error: 'Betalningen kunde inte verifieras' }, { status: 403 })
    }

    if (session.metadata?.onboarding !== 'true') {
      return NextResponse.json({ paid: false, error: 'Betalningen kunde inte verifieras' }, { status: 400 })
    }

    if (session.payment_status !== 'paid' || session.status !== 'complete') {
      // Inte ett fel — betalningen kan vara på väg (3DS/SCA). Klienten
      // fortsätter fråga via GET /api/onboarding.
      return NextResponse.json({ paid: false, pending: true })
    }

    const supabase = getServerSupabase()
    const { critical, period } = await byggAbonnemangsfalt(stripe, session)
    await writeBillingUpdate(supabase, business.business_id, critical, period)

    return NextResponse.json({ paid: critical.subscription_status === 'active' })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('POST /api/billing/onboarding-checkout/verify error:', msg)
    return NextResponse.json({ error: 'Betalningen kunde inte verifieras' }, { status: 500 })
  }
}

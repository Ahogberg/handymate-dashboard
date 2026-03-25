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

    const { setupIntentId, planId } = await request.json()
    if (!setupIntentId || !planId) {
      return NextResponse.json({ error: 'Missing setupIntentId or planId' }, { status: 400 })
    }

    const stripe = getStripe()
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)

    if (setupIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Betalning ej bekräftad' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await supabase
      .from('business_config')
      .update({
        subscription_plan: planId,
        subscription_status: 'trialing',
        trial_ends_at: trialEnd,
      })
      .eq('business_id', business.business_id)

    return NextResponse.json({ success: true, trial_ends_at: trialEnd })
  } catch (error: any) {
    console.error('[billing/confirm] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

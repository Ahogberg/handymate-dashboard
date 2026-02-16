import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover' as any
})

/**
 * POST /api/billing/portal - Skapa Stripe Customer Portal-session
 * Låter kunden hantera sin prenumeration, betalningsmetod och fakturor.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Hämta Stripe customer ID
    const { data: billingData, error: billingError } = await supabase
      .from('business_config')
      .select('stripe_customer_id')
      .eq('business_id', business.business_id)
      .single()

    if (billingError) throw billingError

    if (!billingData?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Ingen aktiv prenumeration hittades. Välj en plan först.' },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Skapa Stripe Customer Portal-session
    const session = await stripe.billingPortal.sessions.create({
      customer: billingData.stripe_customer_id,
      return_url: `${appUrl}/dashboard/settings`
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Create portal session error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

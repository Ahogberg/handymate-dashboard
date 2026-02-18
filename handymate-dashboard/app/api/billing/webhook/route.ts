import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
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
 * POST /api/billing/webhook - Stripe webhook handler
 * Ingen auth -- Stripe skickar webhooks direkt.
 * Validerar signatur och hanterar prenumerationshändelser.
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe()
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }

    // Verifiera webhook-signatur
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(supabase, event, stripe)
        break
      }

      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(supabase, event)
        break
      }

      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(supabase, event)
        break
      }

      case 'invoice.payment_succeeded': {
        await handlePaymentSucceeded(supabase, event)
        break
      }

      case 'invoice.payment_failed': {
        await handlePaymentFailed(supabase, event)
        break
      }

      default: {
        // Logga okända event-typer för debugging
        console.log(`Unhandled Stripe event type: ${event.type}`)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * checkout.session.completed
 * Kunden har slutfört betalningen -- uppdatera plan, Stripe-IDs.
 */
async function handleCheckoutCompleted(supabase: any, event: Stripe.Event, stripe: Stripe) {
  const session = event.data.object as Stripe.Checkout.Session
  const businessId = session.metadata?.business_id
  const planId = session.metadata?.plan_id

  if (!businessId) {
    console.error('Checkout completed without business_id in metadata')
    return
  }

  const updates: Record<string, any> = {
    stripe_customer_id: session.customer as string,
    billing_plan: planId || 'starter',
    billing_status: 'active'
  }

  if (session.subscription) {
    updates.stripe_subscription_id = session.subscription as string

    // Hämta prenumerationsperiod
    try {
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
      updates.billing_period_start = new Date((subscription as any).current_period_start * 1000).toISOString()
      updates.billing_period_end = new Date((subscription as any).current_period_end * 1000).toISOString()
    } catch (err) {
      console.error('Failed to retrieve subscription details:', err)
    }
  }

  await supabase
    .from('business_config')
    .update(updates)
    .eq('business_id', businessId)

  // Logga händelse
  await supabase
    .from('billing_event')
    .insert({
      business_id: businessId,
      event_type: 'checkout_completed',
      stripe_event_id: event.id,
      data: {
        plan_id: planId,
        customer_id: session.customer,
        subscription_id: session.subscription,
        amount_total: session.amount_total
      }
    })
}

/**
 * customer.subscription.updated
 * Prenumerationen har uppdaterats (byte av plan, förnyelse, etc.)
 */
async function handleSubscriptionUpdated(supabase: any, event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription
  const businessId = subscription.metadata?.business_id

  if (!businessId) {
    // Sök business via stripe_subscription_id
    const { data: business } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('stripe_subscription_id', subscription.id)
      .single()

    if (!business) {
      console.error('Subscription updated but no matching business found:', subscription.id)
      return
    }

    await updateSubscriptionData(supabase, business.business_id, subscription, event.id)
    return
  }

  await updateSubscriptionData(supabase, businessId, subscription, event.id)
}

async function updateSubscriptionData(
  supabase: any,
  businessId: string,
  subscription: Stripe.Subscription,
  eventId: string
) {
  // Mappa Stripe-status till vår billing_status
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    trialing: 'trialing',
    incomplete: 'incomplete',
    incomplete_expired: 'cancelled',
    paused: 'paused'
  }

  const billingStatus = statusMap[subscription.status] || subscription.status
  const planId = subscription.metadata?.plan_id

  const updates: Record<string, any> = {
    billing_status: billingStatus,
    billing_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
    billing_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
    stripe_subscription_id: subscription.id
  }

  if (planId) {
    updates.billing_plan = planId
  }

  if (subscription.trial_end) {
    updates.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString()
  }

  await supabase
    .from('business_config')
    .update(updates)
    .eq('business_id', businessId)

  // Logga händelse
  await supabase
    .from('billing_event')
    .insert({
      business_id: businessId,
      event_type: 'subscription_updated',
      stripe_event_id: eventId,
      data: {
        status: subscription.status,
        plan_id: planId,
        period_start: (subscription as any).current_period_start,
        period_end: (subscription as any).current_period_end
      }
    })
}

/**
 * customer.subscription.deleted
 * Prenumerationen har avslutats.
 */
async function handleSubscriptionDeleted(supabase: any, event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription
  const businessId = subscription.metadata?.business_id

  let targetBusinessId = businessId

  if (!targetBusinessId) {
    const { data: business } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('stripe_subscription_id', subscription.id)
      .single()

    if (!business) {
      console.error('Subscription deleted but no matching business found:', subscription.id)
      return
    }

    targetBusinessId = business.business_id
  }

  await supabase
    .from('business_config')
    .update({
      billing_status: 'cancelled',
      stripe_subscription_id: null
    })
    .eq('business_id', targetBusinessId)

  // Logga händelse
  await supabase
    .from('billing_event')
    .insert({
      business_id: targetBusinessId,
      event_type: 'subscription_deleted',
      stripe_event_id: event.id,
      data: {
        subscription_id: subscription.id,
        canceled_at: subscription.canceled_at
      }
    })
}

/**
 * invoice.payment_succeeded
 * Betalning lyckades -- logga händelse.
 */
async function handlePaymentSucceeded(supabase: any, event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice
  const customerId = invoice.customer as string

  // Hitta business via stripe_customer_id
  const { data: business } = await supabase
    .from('business_config')
    .select('business_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!business) {
    console.error('Payment succeeded but no matching business for customer:', customerId)
    return
  }

  // Säkerställ att status är aktiv
  await supabase
    .from('business_config')
    .update({ billing_status: 'active' })
    .eq('business_id', business.business_id)

  // Logga händelse
  await supabase
    .from('billing_event')
    .insert({
      business_id: business.business_id,
      event_type: 'payment_succeeded',
      stripe_event_id: event.id,
      data: {
        invoice_id: invoice.id,
        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        hosted_invoice_url: invoice.hosted_invoice_url
      }
    })
}

/**
 * invoice.payment_failed
 * Betalning misslyckades -- markera som past_due.
 */
async function handlePaymentFailed(supabase: any, event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice
  const customerId = invoice.customer as string

  // Hitta business via stripe_customer_id
  const { data: business } = await supabase
    .from('business_config')
    .select('business_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!business) {
    console.error('Payment failed but no matching business for customer:', customerId)
    return
  }

  await supabase
    .from('business_config')
    .update({ billing_status: 'past_due' })
    .eq('business_id', business.business_id)

  // Logga händelse
  await supabase
    .from('billing_event')
    .insert({
      business_id: business.business_id,
      event_type: 'payment_failed',
      stripe_event_id: event.id,
      data: {
        invoice_id: invoice.id,
        amount_due: invoice.amount_due,
        attempt_count: invoice.attempt_count,
        next_payment_attempt: invoice.next_payment_attempt
      }
    })
}

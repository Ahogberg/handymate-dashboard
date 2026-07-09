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

/** Unix-sekunder → ISO, eller null om värdet saknas/ogiltigt. Skyddar mot att
 *  new Date(undefined*1000).toISOString() kastar (current_period_* flyttade till
 *  subscription items i nyare API-versioner → kan vara undefined). */
function toIsoOrNull(unixSeconds: unknown): string | null {
  const n = Number(unixSeconds)
  if (!n || !isFinite(n)) return null
  const d = new Date(n * 1000)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Skriver billing-uppdateringar till business_config så att en SAKNAD valfri
 * kolumn (billing_period_start/end innan sql/v69 körts i prod) ALDRIG kan
 * blockera den KRITISKA statusskrivningen. Tidigare låg period-fälten i samma
 * update som subscription_status:'active' — saknades kolumnen avvisades HELA
 * uppdateringen och prenumerationen aktiverades aldrig i vår databas trots att
 * Stripe drog pengarna.
 *
 * Kritiska fält skrivs + felkontrolleras och kastar vid fel → Stripe retriar
 * (billing_event-raden loggas först EFTER detta i handlern, så en retry kör om
 * i stället för att hoppas över). Period-fälten skrivs separat best-effort.
 */
async function writeBillingUpdate(
  supabase: any,
  businessId: string,
  critical: Record<string, any>,
  period?: { start?: string | null; end?: string | null },
) {
  const { error } = await supabase
    .from('business_config')
    .update(critical)
    .eq('business_id', businessId)
  if (error) {
    console.error('[Billing webhook] KRITISK: subscription-status kunde inte skrivas — kastar för Stripe-retry:', { businessId, error })
    throw new Error(`business_config kritisk update misslyckades: ${error.message}`)
  }

  const periodUpdate: Record<string, any> = {}
  if (period?.start) periodUpdate.billing_period_start = period.start
  if (period?.end) periodUpdate.billing_period_end = period.end
  if (Object.keys(periodUpdate).length > 0) {
    const { error: perr } = await supabase
      .from('business_config')
      .update(periodUpdate)
      .eq('business_id', businessId)
    if (perr) {
      console.warn('[Billing webhook] billing_period_* ej skrivet (kolumn saknas innan v69?) — icke-blockerande:', perr.message)
    }
  }
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

    // Idempotens (centralt för ALLA event-typer): Stripe levererar minst-en-gång
    // och retriar. Varje handler loggar en billing_event med stripe_event_id — om
    // raden redan finns har vi bearbetat eventet → hoppa över (annars dubbla
    // notiser/referral-belöningar/loggrader). Race-skydd: unikt index i sql/v64.
    const { data: alreadyProcessed } = await supabase
      .from('billing_event')
      .select('id')
      .eq('stripe_event_id', event.id)
      .maybeSingle()
    if (alreadyProcessed) {
      console.log('[Billing] event redan bearbetat, hoppar över:', event.id)
      return NextResponse.json({ received: true, duplicate: true })
    }

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

  // (Idempotens hanteras nu centralt i POST innan dispatch.)

  // Leads-addon-köp: uppdatera INTE subscription_plan (annars nedgraderas
  // kundens riktiga plan till 'starter'). Sätt addon-fälten och hoppa över
  // plan-uppdatering + referral (det är inte en första-betalning).
  if (session.metadata?.addon === 'leads') {
    const tier = session.metadata?.tier || null
    await supabase.from('business_config')
      .update({ leads_addon: true, leads_addon_tier: tier, stripe_customer_id: session.customer as string })
      .eq('business_id', businessId)
    await supabase.from('billing_event').insert({
      business_id: businessId, event_type: 'leads_addon_activated', stripe_event_id: event.id,
      data: { tier, customer_id: session.customer },
    })
    return
  }

  // Vi speglar Stripes verkliga prenumerationsstatus i stället för att hårdkoda
  // 'active'. INGEN trial (Handymate debiterar direkt) → status blir 'active' med
  // en gång för både onboarding-checkouten och uppgradering i Inställningar. Att
  // spegla statusen skyddar mot edge-fall (t.ex. 'incomplete' vid 3DS/SCA).
  const isOnboarding = session.metadata?.onboarding === 'true'

  const statusMap: Record<string, string> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    incomplete: 'incomplete',
    incomplete_expired: 'cancelled',
    paused: 'paused',
  }

  const critical: Record<string, any> = {
    stripe_customer_id: session.customer as string,
    subscription_plan: planId || 'starter',
    subscription_status: 'active'
  }
  let period: { start?: string | null; end?: string | null } | undefined

  if (session.subscription) {
    critical.stripe_subscription_id = session.subscription as string

    // Hämta prenumerationsperiod (best-effort — blockerar aldrig aktiveringen)
    try {
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
      // Vid trial: sätt trialing + trial_ends_at direkt (customer.subscription.updated
      // följer också, men vi vill inte ha ett glapp där status felaktigt är 'active').
      critical.subscription_status = statusMap[subscription.status] || 'active'
      if (subscription.trial_end) {
        critical.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString()
      }
      period = {
        start: toIsoOrNull((subscription as any).current_period_start),
        end: toIsoOrNull((subscription as any).current_period_end),
      }
    } catch (err) {
      console.error('Failed to retrieve subscription details:', err)
    }
  }

  await writeBillingUpdate(supabase, businessId, critical, period)

  // Onboarding: provisionera telefonnummer nu när betalningen är genomförd.
  // Vi anropar INTE /api/onboarding/phone härifrån (den kräver användarens
  // auth-token; webhooken har ingen session). Istället används den delade
  // service-role-hjälparen direkt — idempotent (returnerar befintligt nummer
  // om assigned_phone_number redan är satt) och icke-blockerande.
  if (isOnboarding) {
    try {
      const { purchaseAndAssignNumber } = await import('@/lib/phone/purchase-number')
      const phoneResult = await purchaseAndAssignNumber(supabase, businessId)
      if (!phoneResult.ok) {
        console.error('[Billing webhook] Telefon-provisionering misslyckades (onboarding):', {
          businessId,
          error: phoneResult.error,
          details: phoneResult.details,
        })
      } else {
        console.log('[Billing webhook] Telefon provisionerat (onboarding):', {
          businessId,
          number: phoneResult.phone_number,
          already_assigned: phoneResult.already_assigned,
        })
      }
    } catch (err) {
      // Icke-blockerande — betalningen är redan genomförd. Kunden kan
      // provisionera numret senare via Inställningar om detta fallerar.
      console.error('[Billing webhook] Telefon-provisionering kastade (onboarding):', err)
    }
  }

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

  // Referral-konvertering — belöna referrer vid första betalning
  try {
    const { handleFirstPaymentReferral } = await import('@/lib/referral/discounts')
    const amountSek = Math.round((session.amount_total || 0) / 100)
    const referralResult = await handleFirstPaymentReferral(businessId, amountSek)
    if (referralResult.rewarded) {
      console.log(`[Billing] Referral rewarded for ${businessId}, referrer: ${referralResult.referrerBusinessId}`)
    }
  } catch (err) {
    console.error('[Billing] Referral conversion failed:', err)
  }

  // Notify partner webhook about conversion
  try {
    const { notifyPartnerWebhook } = await import('@/lib/partners/webhook')
    await notifyPartnerWebhook(businessId, 'converted')
  } catch (err) {
    console.error('[Billing] Partner webhook notification failed:', err)
  }
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
  // Mappa Stripe-status till vår subscription_status
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

  const critical: Record<string, any> = {
    subscription_status: billingStatus,
    stripe_subscription_id: subscription.id
  }

  if (planId) {
    critical.subscription_plan = planId
  }

  if (subscription.trial_end) {
    critical.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString()
  }

  // billing_period_* skrivs separat best-effort (kolumnen kan saknas innan v69);
  // subscription_status MÅSTE persisteras och får aldrig blockeras av den.
  const period = {
    start: toIsoOrNull((subscription as any).current_period_start),
    end: toIsoOrNull((subscription as any).current_period_end),
  }

  await writeBillingUpdate(supabase, businessId, critical, period)

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
      subscription_status: 'cancelled',
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

  // Notify partner webhook about churn
  try {
    const { notifyPartnerWebhook } = await import('@/lib/partners/webhook')
    await notifyPartnerWebhook(targetBusinessId, 'churned')
  } catch (err) {
    console.error('[Billing] Partner webhook churn notification failed:', err)
  }
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
    .update({ subscription_status: 'active' })
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
    .update({ subscription_status: 'past_due' })
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

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, getBusinessPlanFromConfig, isBillingActive } from '@/lib/auth'
import { checkSmsRateLimitDb } from '@/lib/rate-limit-db'
import { checkSmsAllowance, trackSmsSent } from '@/lib/sms-usage'
import { getServerSupabase } from '@/lib/supabase'


export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check (DB-backed, persistent across serverless instances)
    const rateLimit = await checkSmsRateLimitDb(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    // Hämta plan + subscription-status för billing-check
    const supabase = getServerSupabase()
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('subscription_plan, subscription_status, trial_ends_at')
      .eq('business_id', business.business_id)
      .single()

    // Blockera om trial gått ut eller betalning misslyckats
    const billingCheck = isBillingActive(bizConfig || {})
    if (!billingCheck.allowed) {
      return NextResponse.json({
        error: billingCheck.message || 'Prenumerationen är inte aktiv',
        billing_inactive: true,
      }, { status: 402 })
    }

    const plan = getBusinessPlanFromConfig(bizConfig || {})

    // SMS-kvot check
    const smsCheck = await checkSmsAllowance(business.business_id, plan)
    if (!smsCheck.allowed) {
      return NextResponse.json({
        error: smsCheck.error,
        quota_exceeded: true,
      }, { status: 429 })
    }

    const { to, message } = await request.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 })
    }

    // ═══ GÅR NU GENOM STRYPUNKTEN (etapp 0 batch 1, 2026-08-08) ═══
    //
    // Routen anropade tidigare 46elks direkt med en egen E.164-formaterare.
    // Den hade kvot, rate limit och billing-check — men INGEN opt-out-spärr,
    // ingen sms_log-rad och ingen kostnadsmätning. sendSmsViaElks har alla
    // tre, plus typografitvätten som halverar kostnaden för meddelanden med
    // tankstreck.
    //
    // BETEENDEÄNDRING: en kund som svarat STOPP blockeras nu även här. Det är
    // avsiktligt — men eftersom det här är hantverkarens EGET manuella utskick
    // får hen ett tydligt besked i stället för en tyst uteblivelse, så hen kan
    // ringa i stället. Ett tyst bortfall vore värre än ett nej.
    const { sendSmsViaElks } = await import('@/lib/sms-send')
    const smsResult = await sendSmsViaElks({
      supabase,
      businessId: business.business_id,
      businessName: business.business_name,
      to,
      message,
      messageType: 'manual',
      recipient: 'customer',
      purpose: 'conversational',
    })

    if (!smsResult.success) {
      const optOut = smsResult.error === 'Kunden har avböjt SMS'
      return NextResponse.json(
        {
          error: optOut
            ? 'Kunden har tackat nej till SMS. Ring eller mejla i stället.'
            : smsResult.error || 'SMS kunde inte skickas',
          ...(optOut ? { opt_out: true } : {}),
        },
        { status: optOut ? 409 : 500 }
      )
    }

    const result = { id: smsResult.elksId || 'unknown' }

    // Räkna upp SMS-usage
    try {
      await trackSmsSent(business.business_id, plan)
    } catch (trackErr) {
      console.error('SMS tracking error (non-blocking):', trackErr)
    }

    // V4 Automation Engine: fire 'contacted' event
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'contacted', business.business_id, {
        phone: to,
        method: 'sms',
      })
    } catch (eventErr) {
      console.error('fireEvent contacted error (non-blocking):', eventErr)
    }

    // Golden Path: flytta deal till "Kontaktad" om den står i "Ny förfrågan"
    try {
      const { data: customer } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', business.business_id)
        .eq('phone_number', to)
        .maybeSingle()

      if (customer) {
        const { data: deal } = await supabase
          .from('deal')
          .select('id, stage_id')
          .eq('business_id', business.business_id)
          .eq('customer_id', customer.customer_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (deal) {
          const { data: stage } = await supabase
            .from('pipeline_stage')
            .select('slug')
            .eq('id', deal.stage_id)
            .single()

          if (stage?.slug === 'new_inquiry' || stage?.slug === 'ny_forfragen') {
            const { moveDeal } = await import('@/lib/pipeline')
            await moveDeal({
              dealId: deal.id,
              businessId: business.business_id,
              toStageSlug: 'contacted',
              triggeredBy: 'system',
              aiReason: 'SMS skickat till kund',
            })
          }
        }
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      id: result.id,
      is_extra: smsCheck.isExtra,
      extra_cost: smsCheck.isExtra ? smsCheck.extraCostSek : undefined,
      warning_percent: smsCheck.warningPercent,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

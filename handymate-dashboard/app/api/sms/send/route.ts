import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkSmsRateLimit, getBusinessPlanFromConfig } from '@/lib/auth'
import { checkSmsAllowance, trackSmsSent } from '@/lib/sms-usage'
import { getServerSupabase } from '@/lib/supabase'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check (per-minute burst protection)
    const rateLimit = checkSmsRateLimit(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    // Hämta plan för kvot-check
    const supabase = getServerSupabase()
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('subscription_plan')
      .eq('business_id', business.business_id)
      .single()

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

    // Formatera till E.164 (+46...)
    const formatPhone = (num: string): string => {
      const clean = num.replace(/[\s\-()]/g, '')
      if (clean.startsWith('0')) return '+46' + clean.slice(1)
      return clean.startsWith('+') ? clean : '+' + clean
    }
    const formattedTo = formatPhone(to)

    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: (business.business_name || 'Handymate').substring(0, 11),
        to: formattedTo,
        message: message,
      }),
    })

    // 46elks returnerar ibland plaintext, inte JSON
    const responseText = await response.text()
    let result: any
    try {
      result = JSON.parse(responseText)
    } catch {
      if (!response.ok) {
        return NextResponse.json({ error: responseText || 'SMS failed' }, { status: 500 })
      }
      result = { id: 'unknown' }
    }

    if (!response.ok) {
      return NextResponse.json({ error: result.message || responseText || 'SMS failed' }, { status: 500 })
    }

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

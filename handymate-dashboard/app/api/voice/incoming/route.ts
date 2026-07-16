import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyElksSignature } from '@/lib/elks-signature'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * Webhook för inkommande samtal från 46elks
 * Flöde baserat på call_handling_mode:
 *
 * agent_always: Agenten svarar, tar meddelande (ingen transfer)
 * agent_with_transfer: Agenten svarar, kan koppla till personal_phone (default)
 * human_work_hours: Under arbetstid → ring personal_phone direkt, utanför → agenten
 */
export const dynamic = 'force-dynamic'

function isWithinWorkHours(workStart: string, workEnd: string, workDays: string[]): boolean {
  const now = new Date()
  // Konvertera till svensk tid (CET/CEST)
  const swedenTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }))
  const dayMap: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }
  const dayKey = dayMap[swedenTime.getDay()]

  if (!workDays.includes(dayKey)) return false

  const [startH, startM] = workStart.split(':').map(Number)
  const [endH, endM] = workEnd.split(':').map(Number)
  const currentMinutes = swedenTime.getHours() * 60 + swedenTime.getMinutes()
  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes
}

export async function POST(request: NextRequest) {
  console.log('[Voice Incoming] POST received, content-type:', request.headers.get('content-type'))

  try {
    const supabase = getServerSupabase()

    const text = await request.text()

    // Verifiera 46elks-signatur (kan inaktiveras via ELKS_SKIP_SIGNATURE i dev)
    if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
      const req = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: text })
      if (!verifyElksSignature(req, text)) {
        console.error('[Voice Incoming] Ogiltig 46elks-signatur, avvisar webhook')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    const params = new URLSearchParams(text)
    const from = params.get('from') ?? ''
    const to = params.get('to') ?? ''
    const callId = params.get('callid') ?? ''
    const direction = params.get('direction') ?? 'inbound'

    console.log('Incoming call:', { from, to, callId, direction })

    // Hitta business baserat på assigned_phone_number (numret som ringdes)
    const { data: business, error: businessError } = await supabase
      .from('business_config')
      .select(`
        business_id,
        business_name,
        assigned_phone_number,
        forward_phone_number,
        personal_phone,
        call_recording_enabled,
        call_recording_consent_message,
        onboarding_data
      `)
      .eq('assigned_phone_number', to)
      .single()

    if (businessError || !business) {
      console.error('No business found for number:', to)
      return NextResponse.json({ "hangup": "no_business_found" })
    }

    // ── Aha-onboardingens ring-test (spec: tasks/aha-onboarding-spec.md) ──
    // Armerat testfönster → deterministisk fångst UTANFÖR regelmotorn
    // (reglerna är inte seedade under onboardingen + nattspärr skulle tyst
    // skippa). Helt innesluten i armerings-checken; fel här får ALDRIG
    // störa normala samtal (yttre try/catch → faller vidare till vanlig routing).
    try {
      const { isTestCallArmed, writeTestCall } = await import('@/lib/onboarding/test-call')
      const testState = ((business as any).onboarding_data?.test_call) || null
      if (isTestCallArmed(testState, Date.now())) {
        console.log('[Voice] Ring-testet armerat — fångar', { from, businessId: business.business_id })

        // 1. Lead + deal, märkt som test (kund dedupas på telefon)
        let leadId: string | null = null, dealId: string | null = null, custId: string | null = null
        try {
          const { createLeadAndDeal } = await import('@/lib/leads/golden-path')
          const gp = await createLeadAndDeal({
            businessId: business.business_id,
            businessPhoneNumber: to,
            name: '🧪 Testsamtal (du)',
            phone: from,
            email: null,
            message: 'Ring-testet från onboardingen — det här leadet är du.',
            source: 'vapi_call',
          }, supabase)
          leadId = gp.leadId; dealId = gp.dealId; custId = gp.customerId
        } catch (gpErr) {
          console.error('[Voice] test-lead misslyckades (fortsätter — SMS:et är aha:t):', gpErr)
        }

        // 2. Catch-SMS OMEDELBART — landar medan de håller telefonen
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const smsResult = await sendSmsViaElks({
          supabase,
          businessId: business.business_id,
          businessName: business.business_name || null,
          to: from,
          message: `Hej! Det här är Lisa på ${business.business_name || 'ditt företag'}. Precis så här snabbt svarar jag dina kunder när du inte hinner 🚀`,
          customerId: custId,
          relatedId: leadId,
          messageType: 'onboarding_test',
        })

        // 3. Skriv stegen + AVARMERA (nästa samtal behandlas normalt)
        await writeTestCall(supabase, business.business_id, {
          armed_until: null,
          called_at: new Date().toISOString(),
          sms_sent: smsResult.success === true,
          sms_error: smsResult.success ? null : (smsResult.error || 'okänt fel'),
          lead_id: leadId, customer_id: custId, deal_id: dealId,
        })

        // 4. Lisas hälsning + handled=1 (ingen dubbel call_missed)
        return NextResponse.json({
          play: `${APP_URL}/api/voice/greeting?business_id=${business.business_id}`,
          whenhangup: `${APP_URL}/api/voice/missed?business_id=${business.business_id}&from=${encodeURIComponent(from)}&callid=${callId}&handled=1`,
        })
      }
    } catch (testErr) {
      console.error('[Voice] ring-test-gren fel (non-blocking, normal routing fortsätter):', testErr)
    }

    // Hämta call_handling_mode från automation_settings
    const { data: autoSettings } = await supabase
      .from('v3_automation_settings')
      .select('call_handling_mode, work_start, work_end, work_days')
      .eq('business_id', business.business_id)
      .maybeSingle()

    const callHandlingMode = autoSettings?.call_handling_mode || 'agent_with_transfer'
    const transferPhone = business.personal_phone || business.forward_phone_number

    // Hitta eller skapa kund baserat på telefonnummer (from)
    let customerId: string | null = null
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', business.business_id)
      .eq('phone_number', from)
      .single()

    customerId = customer?.customer_id || null

    // Logga samtalet i databasen
    await supabase
      .from('call_recording')
      .insert({
        business_id: business.business_id,
        customer_id: customerId,
        phone_number: from,
        direction: direction,
        elks_recording_id: callId,
        created_at: new Date().toISOString()
      })
      .select('recording_id')
      .single()

    // Auto-skapa lead om det inte redan finns en kund (ny uppringare)
    if (!customerId && from) {
      try {
        // Golden Path: skapa kund + lead + DEAL via samma helper som webb-intake.
        // Tidigare skrevs customer/lead direkt med source 'phone_call' — ogiltig
        // enligt valid_source-CHECK (v56) → lead-inserten failade tyst, OCH ingen
        // deal skapades → telefon-leads hamnade aldrig i pipelinen. 'vapi_call' är
        // en giltig källa; createLeadAndDeal skapar deal + fireEvent('lead_received').
        const { createLeadAndDeal } = await import('@/lib/leads/golden-path')
        const gp = await createLeadAndDeal({
          businessId: business.business_id,
          businessPhoneNumber: null, // telefonflödet notifierar redan separat (missat samtal/transfer)
          name: `Ny kund (${from})`,
          phone: from,
          email: null,
          message: 'Inkommande samtal',
          source: 'vapi_call',
        }, supabase)
        customerId = gp.customerId
        if (gp.dealError) console.error('[Voice] Golden Path deal misslyckades:', gp.dealError)
        console.log(`[Voice] Golden Path: lead ${gp.leadId} + deal ${gp.dealId} + customer ${gp.customerId} from ${from}`)
      } catch (leadErr) {
        console.error('[Voice] Auto-lead creation error (non-blocking):', leadErr)
      }
    }

    // Pause nurture sequences when customer calls
    if (customerId) {
      try {
        const { pauseEnrollmentForResponse } = await import('@/lib/nurture')
        await pauseEnrollmentForResponse({
          businessId: business.business_id,
          customerId,
          responseChannel: 'call',
        })
      } catch (err) {
        console.error('[Voice] pauseEnrollmentForResponse failed (non-blocking):', business.business_id, customerId, err)
      }
    }

    // ── Routing baserat på call_handling_mode ──

    // Mode: human_work_hours — ring hantverkaren direkt under arbetstid
    if (callHandlingMode === 'human_work_hours' && transferPhone) {
      const workStart = autoSettings?.work_start || '07:00'
      const workEnd = autoSettings?.work_end || '17:00'
      const workDays = autoSettings?.work_days || ['mon', 'tue', 'wed', 'thu', 'fri']

      if (isWithinWorkHours(workStart, workEnd, workDays)) {
        console.log('[Voice] human_work_hours: within hours, connecting to', transferPhone)

        // Fire event
        try {
          const { fireEvent } = await import('@/lib/automation-engine')
          await fireEvent(supabase, 'call_transferred', business.business_id, {
            to: transferPhone, from, call_id: callId, mode: 'human_work_hours',
          })
        } catch (err) {
          console.error('[Voice] fireEvent call_transferred failed (non-blocking):', business.business_id, callId, err)
        }

        return NextResponse.json({
          connect: transferPhone,
          callerid: to,
          timeout: 20,
          whenhangup: `${APP_URL}/api/voice/missed?business_id=${business.business_id}&from=${encodeURIComponent(from)}&callid=${callId}`,
        })
      }
      // Utanför arbetstid → fall through till agent-hantering nedan
    }

    // Mode: agent_with_transfer — agenten svarar, kan koppla vidare
    // Mode: agent_always — agenten svarar, tar meddelande
    // Mode: human_work_hours utanför arbetstid → agenten tar över

    if (!transferPhone || callHandlingMode === 'agent_always') {
      // Inget personal_phone eller agent_always: agent tar meddelande
      console.log('[Voice] No transfer phone or agent_always mode — agent handles call')

      try {
        const { notifyMissedCall } = await import('@/lib/notifications')
        await notifyMissedCall({
          businessId: business.business_id,
          phoneNumber: from,
        })
      } catch (err) {
        console.error('[Voice] notifyMissedCall failed (non-blocking):', business.business_id, from, err)
      }

      try {
        const { fireEvent } = await import('@/lib/automation-engine')
        await fireEvent(supabase, 'call_missed', business.business_id, {
          phone: from, call_id: callId,
        })
      } catch (err) {
        console.error('[Voice] fireEvent call_missed failed (non-blocking):', business.business_id, callId, err)
      }

      // 46elks: spela meddelande och lägg på (agenten hanterar via webhook)
      return NextResponse.json({
        play: `${APP_URL}/api/voice/greeting?business_id=${business.business_id}`,
        // handled=1: call_missed redan fyrat ovan → voice/missed ska INTE dubbla det.
        whenhangup: `${APP_URL}/api/voice/missed?business_id=${business.business_id}&from=${encodeURIComponent(from)}&callid=${callId}&handled=1`,
      })
    }

    // agent_with_transfer: consent + connect med timeout
    console.log('[Voice] agent_with_transfer: connecting to', transferPhone)

    if (business.call_recording_enabled) {
      return NextResponse.json({
        ivr: `${APP_URL}/api/voice/consent?business_id=${business.business_id}`,
      })
    }

    // Connect direkt med timeout — om ingen svarar, ta meddelande
    return NextResponse.json({
      connect: transferPhone,
      callerid: to,
      timeout: 20,
      whenhangup: `${APP_URL}/api/voice/missed?business_id=${business.business_id}&from=${encodeURIComponent(from)}&callid=${callId}`,
    })

  } catch (error) {
    console.error('Voice webhook error:', error)
    return NextResponse.json({ "hangup": "error" })
  }
}

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
        call_recording_consent_message
      `)
      .eq('assigned_phone_number', to)
      .single()

    if (businessError || !business) {
      console.error('No business found for number:', to)
      return NextResponse.json({ "hangup": "no_business_found" })
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
        // Skapa kund
        const newCustomerId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
        await supabase.from('customer').insert({
          customer_id: newCustomerId,
          business_id: business.business_id,
          name: `Ny kund (${from})`,
          phone_number: from,
          source: 'phone_call',
        })
        customerId = newCustomerId

        // Skapa lead i pipeline
        const leadId = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
        await supabase.from('leads').insert({
          lead_id: leadId,
          business_id: business.business_id,
          customer_id: newCustomerId,
          customer_name: `Ny kund (${from})`,
          phone: from,
          source: 'phone_call',
          status: 'new',
          title: 'Inkommande samtal',
          description: `Inkommande samtal från ${from}`,
          urgency: 'medium',
        })

        // Fire lead_created event → trigger bekräftelse-SMS etc.
        try {
          const { fireEvent } = await import('@/lib/automation-engine')
          await fireEvent(supabase, 'lead_created', business.business_id, {
            lead_id: leadId,
            customer_id: newCustomerId,
            phone: from,
            source: 'phone_call',
          })
        } catch { /* non-blocking */ }

        console.log(`[Voice] Auto-created lead ${leadId} + customer ${newCustomerId} from ${from}`)
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
      } catch { /* non-blocking */ }
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
        } catch { /* non-blocking */ }

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
      } catch { /* non-blocking */ }

      try {
        const { fireEvent } = await import('@/lib/automation-engine')
        await fireEvent(supabase, 'call_missed', business.business_id, {
          phone: from, call_id: callId,
        })
      } catch { /* non-blocking */ }

      // 46elks: spela meddelande och lägg på (agenten hanterar via webhook)
      return NextResponse.json({
        play: `${APP_URL}/api/voice/greeting?business_id=${business.business_id}`,
        whenhangup: `${APP_URL}/api/voice/missed?business_id=${business.business_id}&from=${encodeURIComponent(from)}&callid=${callId}`,
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

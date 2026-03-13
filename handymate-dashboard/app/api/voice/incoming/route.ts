import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * Webhook för inkommande samtal från 46elks
 * Flöde:
 * 1. Ta emot "to" (numret som ringdes)
 * 2. Slå upp business_config baserat på assigned_phone_number
 * 3. Spela consent-meddelande om call_recording_enabled
 * 4. Vidarekoppla till forward_phone_number
 * 5. Spela in samtalet
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log('[Voice Incoming] POST received, content-type:', request.headers.get('content-type'))

  try {
    const supabase = getServerSupabase()

    // Use URLSearchParams instead of formData() for reliable parsing of
    // application/x-www-form-urlencoded (handles charset variants)
    const text = await request.text()
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
        call_recording_enabled,
        call_recording_consent_message
      `)
      .eq('assigned_phone_number', to)
      .single()

    if (businessError || !business) {
      console.error('No business found for number:', to)
      // Lägg på om vi inte hittar ett företag
      return NextResponse.json({ "hangup": "no_business_found" })
    }

    if (!business.forward_phone_number) {
      console.error('No forward number configured for business:', business.business_id)
      // Notify about missed call
      try {
        const { notifyMissedCall } = await import('@/lib/notifications')
        await notifyMissedCall({
          businessId: business.business_id,
          phoneNumber: from,
        })
      } catch { /* non-blocking */ }
      // V3 Automation Engine: fire call_missed event
      try {
        const { fireEvent } = await import('@/lib/automation-engine')
        await fireEvent(supabase, 'call_missed', business.business_id, {
          phone: from, call_id: callId,
        })
      } catch { /* non-blocking */ }
      return NextResponse.json({ "hangup": "no_forward_number" })
    }

    // Hitta eller skapa kund baserat på telefonnummer (from)
    let customerId: string | null = null
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', business.business_id)
      .eq('phone_number', from)
      .single()

    customerId = customer?.customer_id || null

    // Logga samtalet i databasen (call_recording)
    const { data: callRecord } = await supabase
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

    // Bygg svaret till 46elks
    const response: any = {}

    // Om inspelning är aktiverad
    if (business.call_recording_enabled) {
      // Spela consent-meddelande först, sedan koppla vidare
      response.ivr = `${APP_URL}/api/voice/consent?business_id=${business.business_id}`
    } else {
      // Koppla direkt utan inspelning
      response.connect = business.forward_phone_number
      response.callerid = to // Visa företagets nummer
    }

    console.log('Voice response:', response)
    return NextResponse.json(response)

  } catch (error) {
    console.error('Voice webhook error:', error)
    return NextResponse.json({ "hangup": "error" })
  }
}

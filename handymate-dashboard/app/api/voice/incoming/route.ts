import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'

/**
 * Webhook för inkommande samtal från 46elks
 * Flöde:
 * 1. Ta emot "to" (numret som ringdes)
 * 2. Slå upp business_config baserat på assigned_phone_number
 * 3. Spela consent-meddelande om call_recording_enabled
 * 4. Vidarekoppla till forward_phone_number
 * 5. Spela in samtalet
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const formData = await request.formData()
    const from = formData.get('from') as string
    const to = formData.get('to') as string
    const callId = formData.get('callid') as string
    const direction = formData.get('direction') as string || 'inbound'

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

    // Logga samtalet i databasen
    const { data: callRecord } = await supabase
      .from('call')
      .insert({
        business_id: business.business_id,
        customer_id: customerId,
        phone_number: from,
        direction: direction,
        elks_call_id: callId,
        started_at: new Date().toISOString(),
        outcome: 'in_progress'
      })
      .select('call_id')
      .single()

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

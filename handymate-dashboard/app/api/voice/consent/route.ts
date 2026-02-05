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
 * IVR-steg som spelar consent-meddelande och sedan kopplar vidare
 * 46elks anropar denna URL efter att samtalet har kopplats upp
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)
    const business_id = searchParams.get('business_id')

    const formData = await request.formData()
    const from = formData.get('from') as string
    const to = formData.get('to') as string
    const callId = formData.get('callid') as string

    console.log('Consent IVR:', { business_id, from, to, callId })

    if (!business_id) {
      return NextResponse.json({ "hangup": "no_business_id" })
    }

    // Hämta business-config
    const { data: business, error } = await supabase
      .from('business_config')
      .select(`
        forward_phone_number,
        call_recording_consent_message,
        assigned_phone_number
      `)
      .eq('business_id', business_id)
      .single()

    if (error || !business) {
      console.error('Business not found:', business_id)
      return NextResponse.json({ "hangup": "business_not_found" })
    }

    if (!business.forward_phone_number) {
      return NextResponse.json({ "hangup": "no_forward_number" })
    }

    // Consent-meddelande (default om inget är satt)
    const consentMessage = business.call_recording_consent_message ||
      'Detta samtal kan komma att spelas in för kvalitets- och utbildningsändamål.'

    /*
    46elks IVR-format:
    - "play": URL till ljudfil ELLER text som ska läsas upp (TTS)
    - "next": Vad som händer efter (connect, hangup, eller ny IVR-URL)

    För TTS används formatet: "tts:sv-SE:meddelande"
    */

    return NextResponse.json({
      // Spela upp consent-meddelande med svensk TTS
      "play": `tts:sv-SE:${consentMessage}`,
      // Efter meddelandet, koppla vidare till hantverkaren med inspelning
      "next": {
        "connect": business.forward_phone_number,
        "callerid": business.assigned_phone_number || to,
        // Aktivera inspelning - skickar recording till vår webhook när samtalet avslutas
        "recordcall": `${APP_URL}/api/voice/recording`
      }
    })

  } catch (error) {
    console.error('Consent IVR error:', error)
    return NextResponse.json({ "hangup": "error" })
  }
}

/**
 * GET - Tillåt också GET för enklare testning
 */
export async function GET(request: NextRequest) {
  return POST(request)
}

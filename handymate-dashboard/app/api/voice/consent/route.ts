import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyElksSignature } from '@/lib/elks-signature'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * IVR-steg som spelar consent-meddelande och sedan kopplar vidare
 * 46elks anropar denna URL efter att samtalet har kopplats upp
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()

    const rawBody = await request.text()
    if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
      const signedRequest = new NextRequest(request.url, {
        method: 'POST',
        headers: request.headers,
        body: rawBody,
      })
      if (!verifyElksSignature(signedRequest, rawBody)) {
        console.error('[voice/consent] Ogiltig 46elks-signatur, avvisar webhook')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    const formData = new URLSearchParams(rawBody)
    const from = formData.get('from') || ''
    const to = formData.get('to') || ''
    const callId = formData.get('callid') || ''

    console.log('Consent IVR:', { from, to, callId })

    if (!to) {
      return NextResponse.json({ "hangup": "no_called_number" })
    }

    // Derive business_id from the called phone number (assigned_phone_number)
    // instead of trusting the query parameter, to prevent business_id injection
    const { data: business, error } = await supabase
      .from('business_config')
      .select(`
        business_id,
        personal_phone,
        forward_phone_number,
        call_recording_consent_message,
        assigned_phone_number
      `)
      .eq('assigned_phone_number', to)
      .single()

    if (error || !business) {
      console.error('Business not found for phone number:', to)
      return NextResponse.json({ "hangup": "business_not_found" })
    }

    const transferPhone = business.personal_phone || business.forward_phone_number
    if (!transferPhone) {
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
        "connect": transferPhone,
        "callerid": business.assigned_phone_number || to,
        "timeout": 20,
        // Aktivera inspelning - skickar recording till vår webhook när samtalet avslutas
        "recordcall": `${APP_URL}/api/voice/recording`,
        // Samma missat-samtal-räls som den oinspelade connect-vägen. 46elks
        // avgör via answered/state om Lisa ska skicka catch-SMS; ett besvarat
        // samtal skapar aldrig den händelsen.
        "whenhangup": `${APP_URL}/api/voice/missed?business_id=${business.business_id}&from=${encodeURIComponent(from)}&callid=${encodeURIComponent(callId)}`,
      }
    })

  } catch (error) {
    console.error('Consent IVR error:', error)
    return NextResponse.json({ "hangup": "error" })
  }
}

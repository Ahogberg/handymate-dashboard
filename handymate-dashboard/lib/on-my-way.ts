import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSmsSuffix } from './sms-reply-number'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY

export interface OnMyWaySmsArgs {
  supabase: SupabaseClient
  businessId: string
  customerPhone: string
  customerName: string | null
  customerAddress: string | null
  lat?: number | null
  lng?: number | null
  /** Override SMS-text. Om null genereras default från ETA + business-config. */
  message?: string | null
}

export interface OnMyWaySmsResult {
  success: boolean
  /** Lokalt formaterat HH:MM, eller null om ETA inte kunde beräknas */
  eta: string | null
  /** ETA i minuter från nu, eller null */
  eta_minutes: number | null
  /** Truncerad förhandsvisning av SMS-texten (80 tecken) */
  message_preview: string
  /** Felmeddelande om success=false */
  error: string | null
}

/**
 * Skickar ett "på väg"-SMS till kunden med beräknad ankomsttid.
 *
 * - ETA via Google Maps Distance Matrix (kräver lat/lng + customerAddress + GOOGLE_MAPS_API_KEY)
 * - SMS via 46elks (kräver ELKS_API_USER + ELKS_API_PASSWORD)
 * - Loggar varje försök i v3_automation_logs (även misslyckanden)
 *
 * Faller tillbaka på ETA-lös text om Distance Matrix inte är tillgänglig.
 * Returnerar { success: false, error } om SMS-leverans misslyckades —
 * caller bör kolla success innan booking-rader uppdateras.
 */
export async function sendOnMyWaySms(args: OnMyWaySmsArgs): Promise<OnMyWaySmsResult> {
  const { supabase, businessId, customerPhone, customerName, customerAddress, lat, lng, message } = args

  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('business_name, contact_name, phone_number, assigned_phone_number')
    .eq('business_id', businessId)
    .single()

  const businessName = bizConfig?.business_name || 'Handymate'
  const contactName = bizConfig?.contact_name || ''

  // Beräkna ETA via Google Maps Distance Matrix
  let eta: string | null = null
  let etaMinutes: number | null = null
  if (GOOGLE_MAPS_API_KEY && lat && lng && customerAddress) {
    try {
      const origin = `${lat},${lng}`
      const destination = encodeURIComponent(customerAddress)
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&language=sv&key=${GOOGLE_MAPS_API_KEY}`,
      )
      const data = await res.json()
      const element = data?.rows?.[0]?.elements?.[0]
      if (element?.status === 'OK' && element.duration?.value) {
        const seconds = element.duration.value
        etaMinutes = Math.round(seconds / 60)
        const arrivalTime = new Date(Date.now() + seconds * 1000)
        eta = arrivalTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      }
    } catch {
      // Fallback — ingen ETA, fortsätt utan
    }
  }

  // Bygg SMS-text
  const firstName = customerName?.split(' ')[0] || ''
  const suffix = buildSmsSuffix(businessName, bizConfig?.assigned_phone_number)
  const smsText =
    message ||
    (eta
      ? `Hej ${firstName}! ${contactName} från ${businessName} är nu på väg till dig. Beräknad ankomsttid: ${eta}. Vi ses snart!\n${suffix}`
      : `Hej ${firstName}! ${contactName} från ${businessName} är nu på väg till dig. Vi ses snart!\n${suffix}`)

  // Skicka via 46elks
  let smsSuccess = false
  let smsError = ''

  if (ELKS_API_USER && ELKS_API_PASSWORD) {
    try {
      const smsRes = await fetch('https://api.46elks.com/a1/sms', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: businessName.substring(0, 11),
          to: customerPhone,
          message: smsText,
        }),
      })
      smsSuccess = smsRes.ok
      if (!smsRes.ok) {
        const result = await smsRes.json().catch(() => ({}))
        smsError = (result as any)?.message || 'SMS misslyckades'
      }
    } catch (err: any) {
      smsError = err?.message || 'SMS-fel'
    }
  } else {
    smsError = '46elks ej konfigurerad'
  }

  // Logga (non-blocking)
  try {
    await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: 'on_my_way_sms',
      trigger_type: 'manual',
      action_taken: `På väg-SMS till ${customerName || customerPhone}${eta ? ` (ETA ${eta})` : ''}`,
      success: smsSuccess,
      error_message: smsError || null,
      agent_id: 'lars',
    })
  } catch {
    // non-blocking
  }

  return {
    success: smsSuccess,
    eta,
    eta_minutes: etaMinutes,
    message_preview: smsText.substring(0, 80),
    error: smsSuccess ? null : smsError || 'SMS kunde inte skickas',
  }
}

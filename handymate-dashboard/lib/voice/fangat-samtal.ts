/**
 * Push när Lisa fångar ett missat samtal (lanseringsplanen, 2026-09-06).
 *
 * Läget före: ett missat samtal utlöste catch-SMS:et till uppringaren
 * (call_missed → seedad regel "Svar på missat samtal"), men ägaren fick
 * ingen signal alls i den vanligaste vägen — vidarekoppling som ingen
 * svarade på (app/api/voice/missed). Bara röstbrevlådegrenen skrev en
 * in-app-notis, och ingen av vägarna pushade. Det enda ägaren någonsin
 * fick var engångs-SMS:et vid första händelsen (lib/onboarding/
 * first-event-sms.ts). Lisa "fångade" alltså samtal som ägaren inte såg
 * förrän nästa gång appen öppnades.
 *
 * Regeln här: ETT ställe som både skriver in-app-notisen och skickar
 * pushen, anropat efter fireEvent('call_missed') från båda vägarna.
 * Pushen säger bara det som bevisligen hänt: "Lisa fångade ett samtal"
 * kräver att catch-SMS:et faktiskt gick ut (en sms_log-rad med status
 * 'sent' till uppringaren sedan webhooken började). Gick inget SMS ut —
 * regeln avstängd, kund med STOPP, Bränslet slut, 46elks nere — säger
 * pushen "Missat samtal" och ber ägaren ringa upp. Aldrig ett påstående
 * om ett SMS som inte finns.
 *
 * Klass hant (lib/notifications/push-policy.ts): hålls 21–07 och kommer i
 * morgonsammanfattningen; dedupe per call_id så en webhook-retry aldrig
 * ger två pushar. Allt är fail-soft — samtalsvägen får aldrig fällas av
 * en notis.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { findCustomerByPhone, phoneCandidates } from '@/lib/voice/find-customer-by-phone'
import { formatSwedishPhone } from '@/lib/phone-normalize'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import { notifyMissedCall } from '@/lib/notifications'

export const FANGAT_SAMTAL_TYP = 'missed_call_captured'

/** Typalias (inte interface) så den passar Record<string, unknown> i sendApprovalPush. */
export type FangatSamtalPayload = {
  call_id: string
  customer_name: string | null
  phone_display: string
  sms_sent: boolean
}

export interface FangatSamtalIndata {
  supabase: SupabaseClient
  businessId: string
  /** Uppringarens nummer som 46elks skickade det. */
  phone: string
  callId: string
  /** ISO-tid strax FÖRE fireEvent — svar-SMS:et måste vara yngre än så. */
  sedanIso: string
}

export interface FangatSamtalBeroenden {
  skickaPush: (approval: { business_id: string; approval_type: string; payload: FangatSamtalPayload; risk_level: 'low' }) => Promise<void>
  skapaNotis: (params: { businessId: string; phoneNumber: string; customerName?: string }) => Promise<void>
}

const STANDARD: FangatSamtalBeroenden = { skickaPush: sendApprovalPush, skapaNotis: notifyMissedCall }

/** Visningsnamn: kundens namn, annars numret i svensk form, annars "okänt nummer". */
export function visningsnamn(customerName: string | null | undefined, phone: string): string {
  const namn = (customerName || '').trim()
  if (namn) return namn
  return formatSwedishPhone(phone) || phone || 'okänt nummer'
}

/**
 * Bevis på att catch-SMS:et gick ut: en lyckad automationsregel-rad i
 * sms_log till uppringaren, skriven efter att webhooken började. Fel i
 * uppslaget räknas som "inget bevis" — hellre ett försiktigt "Missat
 * samtal" än ett falskt "SMS skickat".
 */
export async function svarSmsSkickat(
  supabase: SupabaseClient,
  businessId: string,
  phone: string,
  sedanIso: string,
): Promise<boolean> {
  const kandidater = phoneCandidates(phone)
  if (kandidater.length === 0) return false
  const { data, error } = await supabase
    .from('sms_log')
    .select('sms_id')
    .eq('business_id', businessId)
    .eq('direction', 'outbound')
    .eq('status', 'sent')
    .eq('message_type', 'automation_rule')
    .in('phone_to', kandidater)
    .gte('created_at', sedanIso)
    .limit(1)
  if (error) {
    console.error('[fangat-samtal] sms_log-uppslag misslyckades (räknas som inget SMS):', error.message)
    return false
  }
  return (data || []).length > 0
}

/**
 * Skriver in-app-notisen och skickar pushen för ett missat samtal.
 * Kastar aldrig. Returnerar vad som faktiskt konstaterades.
 */
export async function meddelaFangatSamtal(
  indata: FangatSamtalIndata,
  deps: FangatSamtalBeroenden = STANDARD,
): Promise<{ sms_sent: boolean; customer_name: string | null }> {
  const { supabase, businessId, phone, callId, sedanIso } = indata
  let customerName: string | null = null
  let smsSent = false
  try {
    const [kund, sms] = await Promise.all([
      findCustomerByPhone(supabase, businessId, phone).catch(err => {
        console.error('[fangat-samtal] kundmatchning misslyckades (non-blocking):', err)
        return null
      }),
      svarSmsSkickat(supabase, businessId, phone, sedanIso),
    ])
    customerName = kund?.name || null
    smsSent = sms

    try {
      await deps.skapaNotis({ businessId, phoneNumber: phone, customerName: customerName || undefined })
    } catch (err) {
      console.error('[fangat-samtal] in-app-notisen kunde inte skrivas (non-blocking):', err)
    }

    const payload: FangatSamtalPayload = {
      call_id: callId,
      customer_name: customerName,
      phone_display: formatSwedishPhone(phone) || phone,
      sms_sent: smsSent,
    }
    try {
      await deps.skickaPush({ business_id: businessId, approval_type: FANGAT_SAMTAL_TYP, payload, risk_level: 'low' })
    } catch (err) {
      console.error('[fangat-samtal] pushen kastade (non-blocking):', err)
    }
  } catch (err) {
    console.error('[fangat-samtal] oväntat fel (non-blocking):', err)
  }
  return { sms_sent: smsSent, customer_name: customerName }
}

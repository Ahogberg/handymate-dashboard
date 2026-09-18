/**
 * Kopplar ett inkommande SMS till det missade samtal det svarar på
 * (spår 1, "Samtalet blir ett jobb").
 *
 * ═══ VARFÖR ═══
 *
 * Fångst-SMS:et som går ut dygnet runt säger ordagrant "Svara på detta SMS
 * med vad du behöver hjälp med". Svaret kom fram, men landade utan minne av
 * frågan: kortet kunde inte säga "det här är svaret på samtalet 14:02", och
 * Matte fick ingen aning om att en dialog redan var påbörjad.
 *
 * Två källor, båda skrivna av vägar som redan finns:
 *   - sms_log: fångst-SMS:et skickas av den seedade regeln "Svar på missat
 *     samtal" (lib/seed-defaults.ts) via regelmotorns handleSendSms, som
 *     sätter messageType 'automation_rule' (verifierat mot prod: 18 rader
 *     bär exakt det värdet, och det är enda automationsvägens värde).
 *   - call_recording: app/api/voice/incoming/route.ts skriver en rad per
 *     inkommande samtal med direction 'inbound' och from_number.
 *
 * Numret matchas ALDRIG rått — 46elks levererar E.164 medan äldre rader kan
 * bära lokalformen. phoneCandidates ger samma kandidatlista som resten av
 * kundminnet använder.
 *
 * Fönstret är 24 timmar. Ett svar dagen efter är fortfarande ett svar; ett
 * svar en vecka senare är ett nytt ärende och ska inte ärva samtalets
 * sammanhang.
 *
 * Kastar ALDRIG. En kopplingsmiss får inte hindra att SMS:et tas emot —
 * hellre ett kort utan samtalsreferens än ett tappat kundsvar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneCandidates } from '@/lib/voice/find-customer-by-phone'

/** Hur länge ett svar räknas som svar på det missade samtalet. */
export const MISSAT_SAMTAL_FONSTER_MS = 24 * 60 * 60 * 1000

export interface MissatSamtalKoppling {
  /** call_recording.recording_id om ett missat samtal hittades, annars null. */
  related_call_id: string | null
  /** Sant när ETT fångst-SMS eller ett inkommande samtal finns i fönstret. */
  svar_pa_missat_samtal: boolean
}

export const INGEN_KOPPLING: MissatSamtalKoppling = {
  related_call_id: null,
  svar_pa_missat_samtal: false,
}

/**
 * Letar efter det missade samtal (eller det fångst-SMS som skickades för
 * det) som avsändaren svarar på.
 */
export async function hittaMissatSamtal(
  supabase: SupabaseClient,
  businessId: string,
  from: string,
  nu: Date = new Date(),
): Promise<MissatSamtalKoppling> {
  try {
    const kandidater = phoneCandidates(from)
    if (kandidater.length === 0) return INGEN_KOPPLING

    const sedan = new Date(nu.getTime() - MISSAT_SAMTAL_FONSTER_MS).toISOString()

    // 1. Fångst-SMS:et. Det är det vi bad kunden svara på, så det väger
    //    tyngst som bevis för att det HÄR SMS:et är ett svar.
    const { data: fangst } = await supabase
      .from('sms_log')
      .select('sms_id, related_id, created_at')
      .eq('business_id', businessId)
      .eq('direction', 'outbound')
      .eq('message_type', 'automation_rule')
      .in('phone_to', kandidater)
      .gte('created_at', sedan)
      .order('created_at', { ascending: false })
      .limit(1)

    const fangstRad = (fangst || [])[0] as { related_id?: string | null } | undefined

    // 2. Själva samtalet — bär id:t kortet och Matte-kontexten vill ha.
    const { data: samtal } = await supabase
      .from('call_recording')
      .select('recording_id, created_at')
      .eq('business_id', businessId)
      .eq('direction', 'inbound')
      .in('from_number', kandidater)
      .gte('created_at', sedan)
      .order('created_at', { ascending: false })
      .limit(1)

    const samtalRad = (samtal || [])[0] as { recording_id?: string | null } | undefined

    const relatedCallId = samtalRad?.recording_id || fangstRad?.related_id || null
    const svar = !!samtalRad || !!fangstRad

    return { related_call_id: relatedCallId, svar_pa_missat_samtal: svar }
  } catch (err) {
    console.error('[sms/relatera-missat-samtal] uppslaget misslyckades (fail-soft):', err)
    return INGEN_KOPPLING
  }
}

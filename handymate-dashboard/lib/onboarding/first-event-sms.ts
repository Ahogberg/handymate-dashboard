import { getServerSupabase } from '@/lib/supabase'
import { getBusinessPreferences, setBusinessPreference } from '@/lib/business-preferences'
import { sendSmsViaElks } from '@/lib/sms-send'

/**
 * Touchpoint 3 (första riktiga händelsen) — se tasks/onboarding-foljeskrift.md.
 *
 * ETT engångs-SMS till FÖRETAGSÄGAREN (inte kunden) när teamet gör sin första
 * meningsfulla åtgärd. Trigger-punkter (whichever inträffar först):
 *   - missed_call        app/api/voice/missed/route.ts
 *   - quote_followup     app/api/cron/quote-follow-up/route.ts
 *   - invoice_reminder   app/api/cron/send-reminders/route.ts
 *
 * Detta är en notis till ägaren själv — INTE ett externt agent-utskick — och
 * går därför INTE via pending_approvals/gating. Flaggan onboarding_first_event_sms
 * i business_preferences säkerställer att det bara skickas en gång per konto.
 *
 * Hela funktionen är fail-safe: fel loggas men kastas ALDRIG, så den aldrig
 * kan fälla anropande huvudflöde (missat samtal-hantering, offert-uppföljning,
 * fakturapåminnelse).
 */

export type FirstEventVariant = 'missed_call' | 'quote_followup' | 'invoice_reminder'

/**
 * Vad som FAKTISKT hände. För missed_call är `svarSkickat` obligatoriskt —
 * texten får inte kunna påstå att kunden fått svar utan att någon vet det.
 */
export interface FirstEventUtfall {
  svarSkickat?: boolean
}

const FLAG_KEY = 'onboarding_first_event_sms'
const MAX_SMS_LENGTH = 160

/**
 * 2026-09-10: texten för missed_call påstod villkorslöst "och skickade ett
 * svar-SMS". Vid provet den morgonen blockerades kundens svar av
 * sjudagarsspärren (`Kunden har redan fått ett SMS de senaste sju dagarna`)
 * medan notisen ändå gick ut och sa att svaret skickats. Kunden fick
 * ingenting; hantverkaren fick beskedet att hon fått svar.
 *
 * Grinden fanns redan och var korrekt — `svarSmsSkickat` i
 * lib/voice/fangat-samtal.ts kollar `.eq('status','sent')`. Felet var att den
 * här texten aldrig fick veta utfallet. Nu KRÄVS det för missed_call.
 *
 * Samma pass: quote_followup sa "följde just upp offerten" när det som faktiskt
 * hänt är att ett kort väntar på ägarens godkännande. Agenter föreslår, ägaren
 * godkänner — texten säger nu det.
 */
function buildMessage(
  variant: FirstEventVariant,
  customerName: string,
  utfall: FirstEventUtfall,
): string {
  const kund = customerName?.trim() || 'en kund'

  switch (variant) {
    case 'missed_call':
      return utfall.svarSkickat
        ? `Handymate: Lisa fångade precis ett samtal du missade från ${kund} och skickade ett svar-SMS. Ligger i appen — kolla när du kan. 💪`
        : `Handymate: Lisa fångade precis ett samtal du missade från ${kund}, men svaret gick inte fram. Ring upp när du kan — allt ligger i appen.`
    case 'quote_followup':
      return `Handymate: Daniel har en uppföljning redo till ${kund} på offerten. Godkänn eller ändra i appen.`
    case 'invoice_reminder':
      return `Handymate: Karin har en påminnelse redo till ${kund} om en förfallen faktura. Ett tryck i appen så går den.`
  }
}

/**
 * Skickar första-händelse-SMS:et till ägaren om det inte redan skickats.
 * Icke-blockerande — anropas fire-and-forget (eller awaitas, spelar ingen
 * roll: den kastar aldrig).
 *
 * För `missed_call` är utfallet OBLIGATORISKT i typen. Det är avsiktligt: felet
 * 2026-09-10 var just ett anrop utan utfall, och en valfri parameter hade
 * tillåtit det igen. Nu är det ett kompileringsfel.
 */
export async function sendFirstEventSms(
  businessId: string,
  variant: 'missed_call',
  customerName: string,
  utfall: { svarSkickat: boolean },
): Promise<void>
export async function sendFirstEventSms(
  businessId: string,
  variant: 'quote_followup' | 'invoice_reminder',
  customerName: string,
  utfall?: FirstEventUtfall,
): Promise<void>
export async function sendFirstEventSms(
  businessId: string,
  variant: FirstEventVariant,
  customerName: string,
  utfall: FirstEventUtfall = {},
): Promise<void> {
  try {
    const prefs = await getBusinessPreferences(businessId)
    if (prefs[FLAG_KEY]) return

    const supabase = getServerSupabase()

    const { data: business, error } = await supabase
      .from('business_config')
      .select('personal_phone, business_name, display_name')
      .eq('business_id', businessId)
      .single()

    if (error || !business) {
      console.error('[first-event-sms] kunde inte hämta business_config:', businessId, error)
      return
    }

    const ownerPhone = business.personal_phone
    if (!ownerPhone) {
      console.error('[first-event-sms] inget ägar-mobilnummer (personal_phone) för business:', businessId)
      return
    }

    let message = buildMessage(variant, customerName, utfall)
    if (message.length > MAX_SMS_LENGTH) message = message.slice(0, MAX_SMS_LENGTH)

    const result = await sendSmsViaElks({
      supabase,
      businessId,
      businessName: business.display_name || business.business_name,
      to: ownerPhone,
      message,
      messageType: 'onboarding_first_event',
      recipient: 'internal',
      purpose: 'internal',
    })

    if (!result.success) {
      console.error('[first-event-sms] SMS-utskick misslyckades:', businessId, variant, result.error)
      return
    }

    // Sätt flaggan ENDAST efter lyckat skick — annars kan ett tillfälligt
    // 46elks-fel permanent tysta touchpointen för det kontot.
    await setBusinessPreference(businessId, FLAG_KEY, '1', 'onboarding')
  } catch (err) {
    console.error('[first-event-sms] error (non-blocking):', err)
  }
}

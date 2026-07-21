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

const FLAG_KEY = 'onboarding_first_event_sms'
const MAX_SMS_LENGTH = 160

function buildMessage(variant: FirstEventVariant, customerName: string): string {
  const kund = customerName?.trim() || 'en kund'

  switch (variant) {
    case 'missed_call':
      return `Handymate: Lisa fångade precis ett samtal du missade från ${kund} och skickade ett svar-SMS. Ligger i appen — kolla när du kan. 💪`
    case 'quote_followup':
      return `Handymate: Daniel följde just upp offerten till ${kund} åt dig. Godkänn eller ändra i appen.`
    case 'invoice_reminder':
      return `Handymate: Karin har en påminnelse redo till ${kund} om en förfallen faktura. Ett tryck i appen så går den.`
  }
}

/**
 * Skickar första-händelse-SMS:et till ägaren om det inte redan skickats.
 * Icke-blockerande — anropas fire-and-forget (eller awaitas, spelar ingen
 * roll: den kastar aldrig).
 */
export async function sendFirstEventSms(
  businessId: string,
  variant: FirstEventVariant,
  customerName: string
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

    let message = buildMessage(variant, customerName)
    if (message.length > MAX_SMS_LENGTH) message = message.slice(0, MAX_SMS_LENGTH)

    const result = await sendSmsViaElks({
      supabase,
      businessId,
      businessName: business.display_name || business.business_name,
      to: ownerPhone,
      message,
      messageType: 'onboarding_first_event',
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

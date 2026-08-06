/**
 * V5 Learning Engine — per-företags-inlärning
 *
 * Loggar varje godkännande, avvisande och justering som ett learning_event.
 * Agenten blir bättre ju längre hantverkaren använder systemet.
 */

import { getServerSupabase } from '@/lib/supabase'

export type LearningEventType =
  | 'approval_accepted'
  | 'approval_rejected'
  | 'approval_edited'
  | 'sms_tone_adjusted'
  | 'quote_price_adjusted'
  | 'lead_manually_moved'

export type ReferenceType = 'lead' | 'quote' | 'invoice' | 'sms' | 'approval'

/**
 * Spara ett inlärningsevent.
 * Kallas från approval-flödet och andra ställen där hantverkaren
 * justerar agentens förslag.
 */
export async function recordLearningEvent(
  businessId: string,
  eventType: LearningEventType,
  referenceId: string | null,
  referenceType: ReferenceType,
  agentSuggestion: Record<string, unknown>,
  humanOverride: Record<string, unknown> | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServerSupabase()

  try {
    const { error } = await supabase
      .from('learning_events')
      .insert({
        business_id: businessId,
        event_type: eventType,
        reference_id: referenceId,
        reference_type: referenceType,
        agent_suggestion: agentSuggestion,
        human_override: humanOverride,
      })

    if (error) {
      // LARM, inte en notis (spår 1.1, 2026-08-06).
      //
      // Den här inserten failade TYST i månader: reference_id var deklarerad
      // UUID medan koden skickar TEXT (`appr_<tid>_<slump>`), så Postgres
      // avvisade varje rad. Felet loggades här — men anroparen kontrollerade
      // aldrig returvärdet, så ingen såg det. Röret lagades i v78, men all
      // inlärningsdata före 2026-08-03 är borta för alltid.
      //
      // Prefixet gör raden sökbar i loggen, och formuleringen säger vad som
      // går förlorat i stället för bara att något gick fel.
      console.error(
        '[LearningEngine] LARM: inlärningshändelsen sparades INTE — ' +
          'agentens förslag och hantverkarens svar går förlorade för mätning. ' +
          `Orsak: ${error.message}`,
        { eventType, referenceId, referenceType },
      )
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[LearningEngine] Error:', err)
    return { success: false, error: err.message }
  }
}

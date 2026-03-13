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
      console.error('[LearningEngine] Insert error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[LearningEngine] Error:', err)
    return { success: false, error: err.message }
  }
}

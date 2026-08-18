/**
 * Mandatets mätning — I/O-lagret (Mission Mandates V1, Etapp X: ägarens
 * upplevelse, tasks/jaunty-pondering-hummingbird.md).
 *
 * `lib/mandates/mandate-facit.ts:byggMandateFacit` är ren funktion, ingen
 * I/O. Den här filen är den enda platsen som läser de tre underlagen den
 * behöver och kallar den — panelen (components/mission/MissionPanel.tsx, via
 * GET /api/mission/active) återanvänder den rakt av, bygger aldrig om
 * räkningen lokalt.
 *
 * ═══ TRE LÄSNINGAR ═══
 *
 *  1. Mandatets stämplade kort (payload.mandate_id) — samma .contains-
 *     uppslag som lib/mandates/resolve.ts:s loadUsage.
 *  2. contactedCustomerAt härleds HÄR (I/O-lagrets jobb, se mandate-facit.ts:s
 *     filhuvud) ur den TIDIGASTE lyckade exekveringens resolved_at (fallback
 *     created_at när resolved_at saknas) — samma "tidigaste per kund"-
 *     dedupprincip som lib/mission/contact-outcomes.ts.
 *  3. Opt-out-händelser (sql/v86_customer_optout.sql: customer.sms_opt_out +
 *     sms_opt_out_at) — bara för de kunder som FAKTISKT kontaktades av det
 *     här mandatet (steg 2:s nyckelmängd), aldrig hela kundregistret.
 *
 * Fail-soft hela vägen: schema saknas eller ett läsfel på kortläsningen ⇒
 * null (facit-sektionen döljer sig tyst i panelen). Ett fel på KUND-
 * läsningen degraderar bara opt-out-underlaget till tomt — korten har redan
 * lästs, facitet räknas ändå (samma partiella-fail-soft-princip som
 * lib/mission/contact-outcomes.ts:s loadContactOutcomes).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { byggMandateFacit, type MandateFacitResult, type MandateFacitCardInput, type MandateFacitOptOutInput } from './mandate-facit'
import type { MandateRow } from './mission-mandate'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

interface CardRow {
  approval_type: string
  status: string
  payload: Record<string, unknown> | null
  created_at: string
  resolved_at: string | null
}

export async function loadMandateFacit(
  supabase: SupabaseClient,
  businessId: string,
  mandate: Pick<MandateRow, 'id' | 'allowed_action_types' | 'status' | 'pause_reason'>,
): Promise<MandateFacitResult | null> {
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('approval_type, status, payload, created_at, resolved_at')
      .eq('business_id', businessId)
      .contains('payload', { mandate_id: mandate.id })

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[mandates] kunde inte läsa mandatets kort för facit (fail-soft, null):', error.message)
      }
      return null
    }

    const rows = (data || []) as CardRow[]
    const cards: MandateFacitCardInput[] = rows.map(r => ({
      approval_type: r.approval_type,
      status: r.status,
      payload: r.payload,
      created_at: r.created_at,
    }))

    // contactedCustomerAt: tidigaste lyckade exekveringen per kund.
    const contactedCustomerAt = new Map<string, string>()
    for (const r of rows) {
      const payload = r.payload || {}
      if (payload.mandate_id !== mandate.id) continue
      const execution = payload.execution_result
      const outcome = execution && typeof execution === 'object' ? (execution as Record<string, unknown>).outcome : undefined
      if (outcome !== 'success') continue
      const customerId = typeof payload.customer_id === 'string' ? payload.customer_id : null
      if (!customerId) continue
      const at = r.resolved_at || r.created_at
      const existing = contactedCustomerAt.get(customerId)
      if (!existing || Date.parse(at) < Date.parse(existing)) contactedCustomerAt.set(customerId, at)
    }

    // Opt-out-underlaget — bara de kontaktade kunderna, fail-soft till tomt.
    let optOutEvents: MandateFacitOptOutInput[] = []
    const customerIds = Array.from(contactedCustomerAt.keys())
    if (customerIds.length > 0) {
      try {
        const { data: custData, error: custErr } = await supabase
          .from('customer')
          .select('customer_id, sms_opt_out, sms_opt_out_at')
          .eq('business_id', businessId)
          .in('customer_id', customerIds)
        if (custErr) {
          if (!arSchemaSaknas(custErr)) {
            console.warn('[mandates] kunde inte läsa opt-out-underlag för facit (fail-soft, tomt):', custErr.message)
          }
        } else if (Array.isArray(custData)) {
          optOutEvents = (custData as Array<{ customer_id: string; sms_opt_out: boolean | null; sms_opt_out_at: string | null }>)
            .filter(c => c.sms_opt_out === true && !!c.sms_opt_out_at)
            .map(c => ({ customer_id: c.customer_id, occurred_at: c.sms_opt_out_at as string }))
        }
      } catch (err) {
        console.warn('[mandates] opt-out-läsningen kastade (fail-soft, tomt):', err)
      }
    }

    return byggMandateFacit({ mandate, cards, optOutEvents, contactedCustomerAt })
  } catch (err) {
    console.error('[mandates] loadMandateFacit kastade oväntat (fail-soft, null):', err)
    return null
  }
}

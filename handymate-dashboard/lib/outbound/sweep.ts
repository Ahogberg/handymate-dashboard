import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import { claimOutboundIntents, listOwedOutboundIntents, deferOutboundIntent, MAX_OUTBOUND_ATTEMPTS, type ClaimedOutbound } from './intents'
import { dispatchClaimedOutbound, checkedPreflight, type Preflight, type ProviderOutcome } from './promise'

/** The resolver must re-read the authorized source under businessId, validate
 * its immutable version/recipient and re-run the source's safety gates.
 * It returns only the provider operation, never the approval executor (which
 * would replay invoice mutation, fees, PDF creation or unrelated effects). */
export type OutboundResolver = (db: SupabaseClient, businessId: string, intent: ClaimedOutbound) => Promise<() => Promise<ProviderOutcome>>
export async function sweepOutboundIntents(db: SupabaseClient, resolve: OutboundResolver,
  options: { shouldStop?: () => boolean; preflight?: Preflight; maxPerBusiness?: number } = {}) {
  const summary = { attempted: 0, deferred: 0, unknown: 0, exhausted: 0, errors: 0 }
  const stop = options.shouldStop ?? (() => false)
  const businesses = await listOwedOutboundIntents(db)
  for (const business of businesses) {
    for (let n = 0; n < (options.maxPerBusiness ?? 25); n++) {
      if (stop()) return summary
      // One claim at a time: do not strand a batch as unknown when budget ends.
      const claim = await claimOutboundIntents(db, business.business_id, null, 1)
      for (const id of claim.unknown_ids) {
        summary.unknown++
        await rapporteraTystFel(db, business.business_id, 'outbound:unknown', 'Leveransbesked saknas. Kontrollera utskicket manuellt.', { intent_id: id })
      }
      const intent = claim.claimed[0]
      if (!intent) break
      try {
        const check = await checkedPreflight(db, business.business_id, intent.kind, intent.context ?? {}, options.preflight)
        if (!check.ok) {
          await deferOutboundIntent(db, business.business_id, intent.id, check.reason ?? 'kontrollfel', intent.attempt_token)
          summary.deferred++
          continue
        }
        const send = await resolve(db, business.business_id, intent)
        const result = await dispatchClaimedOutbound(db, business.business_id, intent, send)
        summary.attempted++
        if (result.status === 'failed' && intent.attempts >= MAX_OUTBOUND_ATTEMPTS) {
          summary.exhausted++
          await rapporteraTystFel(db, business.business_id, 'outbound:exhausted', 'Utskicket behöver hanteras manuellt efter flera misslyckade försök.', { intent_id: intent.id })
        }
      } catch {
        summary.errors++
        // Source read errors are before provider invocation; preserve the
        // promise for recovery instead of consuming the delivery attempt cap.
        await deferOutboundIntent(db, business.business_id, intent.id, 'kontrollfel', intent.attempt_token)
      }
    }
  }
  return summary
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import { claimOutboundIntents, listOwedOutboundIntents, deferOutboundIntent, finishOutboundIntent, MAX_OUTBOUND_ATTEMPTS, type ClaimedOutbound } from './intents'
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
          try {
            await deferOutboundIntent(db, business.business_id, intent.id, check.reason ?? 'kontrollfel', intent.attempt_token)
            summary.deferred++
          } catch (error) {
            // A failed defer write must not abort the all-tenant sweep. The
            // in-flight claim will age to unknown unless a later recovery can
            // prove its state, which is safer than sending through a failed gate.
            summary.errors++
            await rapporteraTystFel(db, business.business_id, 'outbound:defer_failed', 'Utskicket kunde inte skjutas upp säkert. Kontrollera leveransläget manuellt.', {
              intent_id: intent.id,
              error: error instanceof Error ? error.message : 'defer_failed',
            }).catch(() => undefined)
          }
          continue
        }
        const send = await resolve(db, business.business_id, intent)
        const result = await dispatchClaimedOutbound(db, business.business_id, intent, send)
        summary.attempted++
        if (result.status === 'failed' && intent.attempts >= MAX_OUTBOUND_ATTEMPTS) {
          summary.exhausted++
          await rapporteraTystFel(db, business.business_id, 'outbound:exhausted', 'Utskicket behöver hanteras manuellt efter flera misslyckade försök.', { intent_id: intent.id })
        }
      } catch (error) {
        summary.errors++
        // Source/version errors happen before provider invocation and are not
        // transient preflight deferrals. Consume the attempt so a corrupt or
        // missing source reaches the normal manual-review ceiling instead of
        // being reclaimed forever every ten minutes.
        const message = error instanceof Error ? error.message : 'outbound_source_error'
        try {
          const failed = await finishOutboundIntent(db, business.business_id, intent, 'failed', null, message)
          await rapporteraTystFel(db, business.business_id, 'outbound:source_failed', 'Utskickets beständiga källa kunde inte verifieras. Ett automatiskt återförsök räknas mot försökstaket.', {
            intent_id: intent.id,
            error: message,
          }).catch(() => undefined)
          if (failed.status === 'failed' && intent.attempts >= MAX_OUTBOUND_ATTEMPTS) {
            summary.exhausted++
            await rapporteraTystFel(db, business.business_id, 'outbound:exhausted', 'Utskicket behöver hanteras manuellt efter flera misslyckade försök.', { intent_id: intent.id }).catch(() => undefined)
          }
        } catch (finishError) {
          await rapporteraTystFel(db, business.business_id, 'outbound:finish_failed', 'Utskickets felutfall kunde inte sparas. Kontrollera leveransläget manuellt.', {
            intent_id: intent.id,
            error: finishError instanceof Error ? finishError.message : 'finish_failed',
          }).catch(() => undefined)
        }
      }
    }
  }
  return summary
}

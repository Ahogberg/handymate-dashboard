import { getServerSupabase } from '@/lib/supabase'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import type { PaymentEffect } from '@/lib/invoices/apply-payment'
import { kernelDb } from '../kernel-db'
import type { KernelDb } from '../events/publish'
import { claimEffectIntents, finishEffectIntent } from '../commands/service'
import { runPaymentEffect } from '../effects/runners'

/** Shared by the facade and cron. A lost finish never causes another send. */
export async function sweepInvoiceIntents(businessId: string, invoiceId: string, deps: {
  db?: KernelDb; sb?: ReturnType<typeof getServerSupabase>
} = {}) {
  const db = deps.db ?? kernelDb(), sb = deps.sb ?? getServerSupabase()
  const claims = await claimEffectIntents(db, businessId, invoiceId)
  for (const id of claims.unknown_ids || []) {
    await rapporteraTystFel(sb, businessId, 'financial-kernel:effect-unknown',
      'Utskicksutfallet måste kontrolleras manuellt', { invoiceId, intentId: id })
  }
  const effects: PaymentEffect[] = []
  for (const intent of claims.claimed) {
    let result: PaymentEffect
    try { result = await runPaymentEffect(businessId, invoiceId, intent) }
    catch (error) {
      result = { effect: intent.effect, status: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
    try {
      await finishEffectIntent(db, businessId, intent,
      result.status === 'failed' ? 'failed' : result.status === 'skipped' ? 'skipped' : 'sent', result, result.message)
    } catch (error) {
      // The provider may already have delivered. Keep this attempt uncertain and continue the other claims.
      await rapporteraTystFel(sb, businessId, 'financial-kernel:effect-finish-failed',
        error instanceof Error ? error.message : String(error), { invoiceId, intentId: intent.id })
      effects.push({ effect: intent.effect, status: 'failed', message: 'Leveranskvittensen kunde inte sparas; kontrollera utfallet manuellt.' })
      continue
    }
    effects.push(result)
    if (result.status === 'failed' && intent.attempts >= 3) {
      await rapporteraTystFel(sb, businessId, 'financial-kernel:effect-exhausted',
        result.message || 'Efterbetalningseffekt misslyckades', { invoiceId, intentId: intent.id })
    }
  }
  return { effects, markedUnknown: claims.marked_unknown }
}

import { getFortnoxInvoice } from '@/lib/fortnox'
import { normalizeFortnoxShadowSnapshot, type RawFortnoxShadowSnapshot } from '@/lib/fortnox/shadow-adapter'
import { getServerSupabase } from '@/lib/supabase'
import { rapporteraTystFelMedKvittens } from '@/lib/observability/driftlarm'
import { kernelDb } from '../kernel-db'
import type { KernelDb } from '../events/publish'
import { readPhase } from '../phase'
import { compareInvoiceLevel1, COMPARISON_VERSION } from './compare'
import { listShadowCandidates, openShadowRun, closeShadowRun, recordShadowSnapshot, recordShadowComparison,
  markShadowDivergencesReported, type ShadowSighting } from './service'

export interface ShadowRunOptions {
  trigger?: 'cron' | 'manual'; db?: KernelDb; sb?: ReturnType<typeof getServerSupabase>; now?: () => number; deadline?: number
  reader?: (businessId: string, documentNumber: string) => Promise<unknown>
  report?: (businessId: string, sightings: ShadowSighting[], phase: string) => Promise<void>
}
/** Observe only: no invoice mutation or payment-command path belongs in this module. */
export async function runShadowForBusiness(businessId: string, options: ShadowRunOptions = {}) {
  const db = options.db ?? kernelDb(), now = options.now ?? Date.now, deadline = options.deadline ?? now() + 240_000
  // Reserve time to persist unsupported levels, reports and close the run. Fortnox GET caps itself at 20s.
  const shouldStop = () => now() + 25_000 >= deadline
  const phase = await readPhase(db, businessId)
  const counts = { compared: 0, match: 0, divergent: 0, reference_missing: 0, unsupported: 0, closed: 0, reported: 0, budgetExhausted: false }
  if (phase === 'off' || shouldStop()) return { phase, status: 'skipped' as const, counts }
  const run = await openShadowRun(db, businessId, options.trigger ?? 'manual', COMPARISON_VERSION)
  let failure: unknown
  const reportable = new Map<string, ShadowSighting>()
  const reader = options.reader ?? getFortnoxInvoice
  try {
    const candidates = (await listShadowCandidates(db, businessId)).slice(0, 200)
    for (const candidate of candidates) {
      if (shouldStop()) { counts.budgetExhausted = true; break }
      const handymate = candidate.handymate, document = handymate.fortnox_document_number
      let snapshot: RawFortnoxShadowSnapshot | null = null, snapshotId: string | undefined
      if (document != null && String(document).trim() !== '') {
        try {
          const invoice = await reader(businessId, String(document))
          if (!invoice || typeof invoice !== 'object') throw new Error('Fortnox invoice response missing')
          snapshot = { fetch_status: 'ok', snapshot: invoice }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          snapshot = { fetch_status: message === 'Fortnox API error: 404' ? 'not_found' : 'error', error: message.slice(0, 500) }
        }
        snapshotId = await recordShadowSnapshot(db, businessId, candidate.invoice_id, String(document), snapshot)
      }
      const comparison = compareInvoiceLevel1(handymate, normalizeFortnoxShadowSnapshot(snapshot))
      const recorded = await recordShadowComparison(db, businessId, run.run_id, { level: 1, objectType: 'invoice',
        invoiceId: candidate.invoice_id, snapshotId, ...comparison, handymate })
      counts.compared++; counts[comparison.result]++; counts.closed += recorded.closed
      for (const sighting of recorded.divergences) if (sighting.report) reportable.set(sighting.id, sighting)
    }
  } catch (error) { failure = error }
  // Also persist unsupported scope when the read loop fails; never present an incomplete run as a match.
  try {
    for (const [level, objectType] of [[2, 'ledger'], [3, 'aggregate'], [4, 'report']] as const) {
      await recordShadowComparison(db, businessId, run.run_id, { level, objectType, result: 'unsupported',
        handymate: { reason: 'bookkeeping scope not granted' }, differences: [] })
      counts.unsupported++
    }
    if (reportable.size) {
      const sightings = Array.from(reportable.values())
      if (options.report) await options.report(businessId, sightings, run.phase)
      else {
        const ranks = ['critical', 'high', 'medium', 'low', 'info']
        const severity = ranks.find(s => sightings.some(d => d.severity === s)) ?? 'medium'
        const persisted = await rapporteraTystFelMedKvittens(options.sb ?? getServerSupabase(), businessId, 'financial-kernel:shadow-divergence',
          `${sightings.length} bekräftade avvikelser i skuggjämförelsen (${severity})`,
          { phase: run.phase, count: sightings.length, severity, divergenceIds: sightings.map(s => s.id) })
        if (!persisted) throw new Error('financial_shadow_report_not_persisted')
      }
      await markShadowDivergencesReported(db, businessId, sightings.map(s => s.id))
      counts.reported = sightings.length
    }
  } catch (error) { failure ??= error }
  const status = failure ? 'failed' : 'completed'
  await closeShadowRun(db, businessId, run.run_id, status, { ...counts,
    ...(failure ? { error: failure instanceof Error ? failure.message : String(failure) } : {}) })
  if (failure) throw failure
  return { phase: run.phase, runId: run.run_id, status, counts }
}

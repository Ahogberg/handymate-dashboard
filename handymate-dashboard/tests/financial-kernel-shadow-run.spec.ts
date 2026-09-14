import { test, expect } from '@playwright/test'
import { c5Modules } from './helpers/c5-module'
import fs from 'node:fs'

function harness(options: { phase?: string; cap?: number; report?: boolean; fetchError?: string; noDocument?: boolean } = {}) {
  const calls: { name: string; args: any }[] = [], reports: unknown[] = [], fetches: string[] = []
  let time = 0, marked = false
  const invoice = { invoice_id: 'i', fortnox_document_number: options.noDocument ? null : '123', status: 'paid', paid_amount: '100', sent_at: '2026-09-01', phase_started_at: '2026-08-01',
    projection: { recorded_minor: '10000', derived_status: 'paid', receivables: [{ amount_minor: '10000', outstanding_minor: '0', component: 'customer', status: 'settled' }] } }
  const db = { async rpc(name: string, args: any) {
    calls.push({ name, args })
    let data: unknown
    switch (name) {
      case 'financial_kernel_phase': data = options.phase ?? 'S1'; break
      case 'open_shadow_run': data = { run_id: 'run', phase: 'S1' }; break
      case 'list_shadow_candidates': data = Array.from({ length: options.cap ?? 1 }, (_, n) => ({ invoice_id: String(n), handymate: { ...invoice, invoice_id: String(n) } })); break
      case 'record_shadow_snapshot': data = 'snapshot-' + calls.length; break
      case 'record_shadow_comparison': data = { comparison_id: 'comparison', closed: 0, divergences: args.p_level === 1 && options.report ? [{ id: 'divergence', severity: 'high', report: !marked, confirmed: true, seen_count: 2 }] : [] }; break
      case 'mark_shadow_divergences_reported': marked = true; data = 1; break
      case 'close_shadow_run': data = {}; break
      default: throw Error('Forbidden RPC ' + name)
    }
    return { data, error: null }
  } }
  const load = c5Modules({ '@/lib/fortnox': { getFortnoxInvoice: () => { throw Error('must inject reader') } },
    '@/lib/supabase': { getServerSupabase: () => { throw Error('unexpected database write') } },
    '@/lib/financial-kernel/kernel-db': { kernelDb: () => db }, '../kernel-db': { kernelDb: () => db },
    '@/lib/observability/driftlarm': { rapporteraTystFel: () => { throw Error('must inject report') } } })
  const run = (override: any = {}) => load('lib/financial-kernel/shadow/run.ts').runShadowForBusiness('a', { db, now: () => time, deadline: 240000,
    reader: async (_b: string, document: string) => { fetches.push(document); if (options.fetchError) throw Error(options.fetchError); return { Total: 100, TotalToPay: 100, Balance: 0, FullyPaid: true } },
    report: async (...args: unknown[]) => { reports.push(args) }, ...override })
  return { calls, reports, fetches, run, setTime: (t: number) => { time = t } }
}
test('run snapshots exact provider response, ties comparison to it and records unsupported levels', async () => {
  const h = harness(); const result = await h.run()
  expect(result.phase).toBe('S1'); expect(result.counts.match).toBe(1)
  const snapshot = h.calls.find(c => c.name === 'record_shadow_snapshot')!
  expect(snapshot.args.p_snapshot).toEqual({ Total: 100, TotalToPay: 100, Balance: 0, FullyPaid: true })
  const comparisons = h.calls.filter(c => c.name === 'record_shadow_comparison')
  expect(comparisons[0].args.p_snapshot_id).toMatch(/^snapshot-/)
  expect(comparisons.slice(1).map(c => [c.args.p_level, c.args.p_result, c.args.p_handymate.reason])).toEqual([2, 3, 4].map(n => [n, 'unsupported', 'bookkeeping scope not granted']))
})
test('off phase does not open or fetch; cap and budget stop further observations', async () => {
  const off = harness({ phase: 'off' }); expect((await off.run()).status).toBe('skipped'); expect(off.calls).toHaveLength(1)
  const cap = harness({ cap: 201 }); expect((await cap.run()).counts.compared).toBe(200)
  const budget = harness({ cap: 5 }); const result = await budget.run({ reader: async () => { budget.setTime(220000); return { Total: 100, TotalToPay: 100, Balance: 0, FullyPaid: true } } })
  expect(result.counts.compared).toBe(1); expect(result.counts.budgetExhausted).toBe(true); expect(result.counts.unsupported).toBe(3)
})
test('reports only reportable confirmations then marks them; later run stays quiet', async () => {
  const h = harness({ report: true }); await h.run(); await h.run()
  expect(h.reports).toHaveLength(1)
  expect(h.calls.filter(c => c.name === 'mark_shadow_divergences_reported')).toHaveLength(1)
})
test('404 and network failure remain distinct immutable observations', async () => {
  for (const [error, status] of [['Fortnox API error: 404', 'not_found'], ['network failed', 'error']]) {
    const h = harness({ fetchError: error }); await h.run()
    expect(h.calls.find(c => c.name === 'record_shadow_snapshot')!.args.p_fetch_status).toBe(status)
  }
})
test('report failure closes run as failed and never marks unreported divergence', async () => {
  const h = harness({ report: true }); await expect(h.run({ report: async () => { throw Error('report failed') } })).rejects.toThrow('report failed')
  expect(h.calls.some(c => c.name === 'mark_shadow_divergences_reported')).toBe(false)
  expect(h.calls.find(c => c.name === 'close_shadow_run')!.args.p_status).toBe('failed')
})
test('shadow source has no payment command, facade or invoice writes', () => {
  for (const file of fs.readdirSync('lib/financial-kernel/shadow').filter(f => f.endsWith('.ts'))) {
    const source = fs.readFileSync('lib/financial-kernel/shadow/' + file, 'utf8')
    expect(source).not.toMatch(/applyInvoicePayment|execute_payment_command|issue_invoice_receivables|record_payment|allocate_payment|reverse_allocation|commands\/facade|\.from\(['"]invoice['"]\)/)
  }
})
test('daily cron authenticates first and excludes off or disconnected businesses', async () => {
  const visits: string[] = [], db = { rpc: async () => ({ data: [
    { business_id: 'off', phase: 'off' }, { business_id: 'disconnected', phase: 'S1' }, { business_id: 'pilot', phase: 'S1' }], error: null }) }
  const load = c5Modules({ '@/lib/cron/verify-secret': { verifyCronSecret: (r: Request) => r.headers.get('authorization') === 'Bearer secret' },
    '@/lib/supabase': { getServerSupabase: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [{ business_id: 'off' }, { business_id: 'pilot' }], error: null }) }) }) }) },
    '@/lib/financial-kernel/kernel-db': { kernelDb: () => db },
    '@/lib/financial-kernel/shadow/run': { runShadowForBusiness: async (business: string) => { visits.push(business); return { phase: 'S1' } } } })
  const route = load('app/api/cron/financial-kernel-shadow/route.ts')
  expect((await route.GET(new Request('https://test/cron'))).status).toBe(401); expect(visits).toEqual([])
  const response = await route.GET(new Request('https://test/cron', { headers: { authorization: 'Bearer secret' } }))
  expect(response.status).toBe(200); expect(visits).toEqual(['pilot'])
})
test('real drift reporter returns failure receipt on failed insert and preserves legacy nonthrowing API', async () => {
  const load = c5Modules({ '@/lib/observability/sentry': { rapporteraTillSentry: () => {} } })
  const reporter = load('lib/observability/driftlarm.ts')
  const sb = { from: () => ({ insert: async () => ({ error: { message: 'database unavailable' } }) }) }
  expect(await reporter.rapporteraTystFelMedKvittens(sb, 'a', 'financial-kernel:shadow-divergence', 'test')).toBe(false)
  await expect(reporter.rapporteraTystFel(sb, 'a', 'test', 'test')).resolves.toBeUndefined()
  const working = { from: () => ({ insert: async () => ({ error: null }) }) }
  expect(await reporter.rapporteraTystFelMedKvittens(working, 'a', 'financial-kernel:shadow-divergence', 'test')).toBe(true)
})

test('missing document number records reference unavailable without fetching or snapshot row', async () => {
  const h = harness({ noDocument: true }); const result = await h.run()
  expect(h.fetches).toEqual([]); expect(h.calls.some(c => c.name === 'record_shadow_snapshot')).toBe(false)
  expect(result.counts.reference_missing).toBe(1)
  expect(h.calls.find(c => c.name === 'record_shadow_comparison')!.args.p_snapshot_id).toBeNull()
})

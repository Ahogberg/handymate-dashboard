import { test, expect } from '@playwright/test'
import { withOutboundPromise, dispatchClaimedOutbound, type ProviderOutcome } from '../lib/outbound/promise'
import { outboundStatusText } from '../lib/outbound/status'
import type { OutboundPromise } from '../lib/outbound/intents'
import { c5Modules } from './helpers/c5-module'
import { NextRequest, NextResponse } from 'next/server'

const input: OutboundPromise = { businessId: 'a', source: 'approval', sourceId: 'approved-1', dedupeKey: 'approved-1:sms', kind: 'sms', template: 'approved-sms', recipient: '+46700000001' }
const active = { id: 'i', attempt_token: 'fence', attempts: 1, kind: 'sms' as const, source: 'approval' as const, source_id: 'approved-1', recipient: input.recipient, template: input.template, autonomy_key: null, context: null }
const ready = async () => ({ channel: 'sms' as const, ok: true, message: '', href: '' })
function fixture(options: { status?: string; finishError?: boolean; revoked?: boolean; cancelAtFinish?: boolean; cancelBeforeSend?: boolean } = {}) {
  let state = options.status ?? 'pending'
  const calls: Array<{ name: string; args: any }> = []
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { status: 'attempting', attempt_token: 'fence', cancel_requested_at: options.cancelBeforeSend ? new Date().toISOString() : null } }) }
  const db: any = { from: () => query, rpc: async (name: string, args: any) => {
    calls.push({ name, args })
    if (name === 'record_outbound_intent') return { data: options.revoked ? { blocked: true, created: false } : { id: 'i', status: state, created: true } }
    if (name === 'claim_outbound_intents') {
      const claimed = state === 'pending' ? [active] : []; state = 'attempting'
      return { data: { claimed, unknown_ids: [], cancelled_ids: [] } }
    }
    if (name === 'defer_outbound_intent') return { data: { status: 'pending', deferred: true } }
    if (name === 'finish_outbound_intent') {
      if (options.finishError) return { error: { message: 'receipt transport failed' } }
      state = args.p_status
      return { data: { status: state, cancel_requested: options.cancelAtFinish ?? false } }
    }
    throw Error(name)
  } }
  return { db, calls }
}
test('promise is persisted before preflight and before provider invocation', async () => {
  const { db, calls } = fixture()
  const check = async () => { expect(calls[0].name).toBe('record_outbound_intent'); return ready() }
  const send = async (): Promise<ProviderOutcome> => {
    expect(calls.at(-1)?.name).toBe('claim_outbound_intents'); return { status: 'sent', providerRef: 'p' }
  }
  expect(await withOutboundPromise(db, input, send, check)).toMatchObject({ status: 'sent', receiptConfirmed: true, providerRef: 'p' })
})
test('preflight failure preserves pending without calling provider or taking an attempt', async () => {
  const { db, calls } = fixture(); let sent = 0
  const result = await withOutboundPromise(db, input, async () => { sent++; return { status: 'sent' } }, async () => ({ channel: 'sms', ok: false, reason: 'saldo', message: '', href: '' }))
  expect(result.status).toBe('pending'); expect(sent).toBe(0)
  expect(calls.map(c => c.name)).toEqual(['record_outbound_intent', 'defer_outbound_intent'])
  expect(calls.at(-1)?.args.p_reason).toBe('saldo')
})
test('preflight exception defers as kontrolfel', async () => {
  const { db, calls } = fixture()
  await withOutboundPromise(db, input, async () => { throw Error('must not send') }, async () => { throw Error('network') })
  expect(calls.at(-1)?.args.p_reason).toBe('kontrollfel')
})
test('two concurrent invocations produce at most one provider call', async () => {
  const { db } = fixture(); let count = 0
  const send = async (): Promise<ProviderOutcome> => { count++; return { status: 'sent', providerRef: 'p' } }
  await Promise.all([withOutboundPromise(db, input, send, ready), withOutboundPromise(db, input, send, ready)])
  expect(count).toBe(1)
})
for (const state of ['sent', 'unknown', 'attempting', 'skipped']) test(`${state} never dispatches again`, async () => {
  const { db, calls } = fixture({ status: state }); let count = 0
  await withOutboundPromise(db, input, async () => { count++; return { status: 'sent' } }, ready)
  expect(count).toBe(0); expect(calls).toHaveLength(1)
})
test('definite rejection finishes as failed with the claim token', async () => {
  const { db, calls } = fixture()
  expect(await withOutboundPromise(db, input, async () => ({ status: 'failed', error: 'rejected' }), ready)).toMatchObject({ status: 'failed', receiptConfirmed: true })
  expect(calls.at(-1)?.args).toMatchObject({ p_attempt_token: 'fence', p_status: 'failed', p_max_attempts: 3 })
})
test('lost provider acknowledgement never becomes a retryable failure', async () => {
  const { db, calls } = fixture()
  expect(await withOutboundPromise(db, input, async () => { throw Error('lost ack') }, ready)).toMatchObject({ status: 'unknown', receiptConfirmed: false })
  expect(calls.some(c => c.name === 'finish_outbound_intent')).toBe(false)
})
test('lost finish keeps provider reference without claiming a durable receipt', async () => {
  const { db, calls } = fixture({ finishError: true })
  expect(await withOutboundPromise(db, input, async () => ({ status: 'sent', providerRef: 'accepted-1' }), ready)).toMatchObject({ status: 'unknown', receiptConfirmed: false, providerRef: 'accepted-1' })
  expect(calls.filter(c => c.name === 'finish_outbound_intent')).toHaveLength(1)
})
test('off before record prevents all preflight and provider work', async () => {
  const { db, calls } = fixture({ revoked: true })
  expect(await withOutboundPromise(db, input, async () => { throw Error('must not send') }, ready)).toMatchObject({ status: 'skipped' })
  expect(calls).toHaveLength(1)
})
test('off during provider call preserves the result and cancellation fact', async () => {
  const { db } = fixture({ cancelAtFinish: true })
  expect(await dispatchClaimedOutbound(db, 'a', active, async () => ({ status: 'sent', providerRef: 'p' }))).toMatchObject({ status: 'sent', cancelRequested: true })
})
test('off during source preparation stops the provider call', async () => {
  const { db } = fixture({ cancelBeforeSend: true }); let sent = 0
  expect(await dispatchClaimedOutbound(db, 'a', active, async () => { sent++; return { status: 'sent' } })).toMatchObject({ status: 'skipped', receiptConfirmed: true })
  expect(sent).toBe(0)
})
test('display never promotes uncertainty or deferral to sent', () => {
  expect(outboundStatusText({ status: 'unknown' })).toBe('Utfallet är inte bekräftat')
  expect(outboundStatusText({ status: 'pending', defer_reason: 'saldo' })).toBe('Väntar på saldo')
  expect(outboundStatusText({ status: 'sent', finished_at: '2026-09-15T06:12:00Z', cancel_requested: true })).toBe('Skickat 08:12. Avstängningen kom efter att utskicket påbörjats.')
})

test('admin rejects unauthenticated resolution before reading input or database', async () => {
  const load = c5Modules({
    '@/lib/financial-kernel/admin': { financialKernelAdmin: async () => null },
    '@/lib/supabase': { getServerSupabase: () => { throw Error('must not read database') } },
  })
  const route = load('app/api/admin/outbound/intents/route.ts')
  expect((await route.GET(new NextRequest('https://test/?business_id=a'))).status).toBe(403)
  expect((await route.POST(new NextRequest('https://test/', { method: 'POST', body: 'invalid' }))).status).toBe(403)
})
test('admin validates reason and uses verified actor rather than request actor', async () => {
  const calls: any[] = []
  const load = c5Modules({
    '@/lib/financial-kernel/admin': {
      financialKernelAdmin: async () => 'verified-admin',
      requiredText: (v: unknown) => { if (typeof v !== 'string' || !v.trim()) throw new TypeError('required'); return v.trim() },
      adminFailure: () => NextResponse.json({}, { status: 400 }),
    },
    '@/lib/supabase': { getServerSupabase: () => ({ rpc: async (name: string, args: any) => { calls.push({ name, args }); return { data: { to: 'sent' } } } }) },
  })
  const route = load('app/api/admin/outbound/intents/route.ts')
  const post = (reason: string) => route.POST(new NextRequest('https://test/', { method: 'POST', body: JSON.stringify({ business_id: 'a', id: 'i', resolution: 'delivered', actor_id: 'spoofed', reason }) }))
  expect((await post(' ')).status).toBe(400); expect(calls).toHaveLength(0)
  expect((await post('Kontrollerat')).status).toBe(200)
  expect(calls[0].args).toMatchObject({ p_actor_id: 'verified-admin', p_business_id: 'a', p_reason: 'Kontrollerat' })
})
test('sweep recovers all tenants, defers preflight without dispatch and respects budget before claim', async () => {
  const calls: string[] = []; let index = 0, providers = 0
  const db: any = { rpc: async (name: string) => {
    calls.push(name)
    if (name === 'list_owed_outbound_intents') return { data: [{ business_id: 'non-kernel', owed: 1, stale: 0 }] }
    if (name === 'claim_outbound_intents') return { data: { claimed: index++ ? [] : [active], unknown_ids: [], cancelled_ids: [] } }
    if (name === 'defer_outbound_intent') return { data: { deferred: true, status: 'pending' } }
    throw Error(name)
  } }
  const load = c5Modules({ '@/lib/observability/driftlarm': { rapporteraTystFel: async () => {} } })
  const { sweepOutboundIntents } = load('lib/outbound/sweep.ts')
  const resolve = async () => async () => { providers++; return { status: 'sent' } }
  const result = await sweepOutboundIntents(db, resolve, { preflight: async () => ({ channel: 'sms', ok: false, reason: 'saldo' }) })
  expect(result.deferred).toBe(1); expect(providers).toBe(0)
  calls.length = 0
  await sweepOutboundIntents(db, resolve, { shouldStop: () => true })
  expect(calls).toEqual(['list_owed_outbound_intents'])
})

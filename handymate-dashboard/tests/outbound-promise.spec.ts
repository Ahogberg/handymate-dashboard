import { test, expect } from '@playwright/test'
import { withOutboundPromise, dispatchClaimedOutbound, type ProviderOutcome } from '../lib/outbound/promise'
import { outboundStatusText } from '../lib/outbound/status'
import { readOutboundReceipt, type OutboundPromise } from '../lib/outbound/intents'
import { outboundVersion, readOutboundSource, type SmsEnvelope } from '../lib/outbound/source'
import { aggregateAutonomyOutcome, reviewedDocumentReceipt } from '../lib/outbound/resolve'
import { pushProviderOutcome } from '../lib/notifications/push-delivery'
import { c5Modules } from './helpers/c5-module'
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'

const input: OutboundPromise = { businessId: 'a', source: 'approval', sourceId: 'approved-1', dedupeKey: 'approved-1:sms', kind: 'sms', template: 'approved-sms', recipient: '+46700000001' }
const active = { id: 'i', attempt_token: 'fence', attempts: 1, kind: 'sms' as const, source: 'approval' as const, source_id: 'approved-1', dedupe_key: input.dedupeKey, recipient: input.recipient, template: input.template, autonomy_key: null, context: null }
const ready = async () => ({ channel: 'sms' as const, ok: true, message: '', href: '' })
function fixture(options: { status?: string; providerRef?: string; finishError?: boolean; revoked?: boolean; cancelAtFinish?: boolean; cancelBeforeSend?: boolean } = {}) {
  let state = options.status ?? 'pending'
  const calls: Array<{ name: string; args: any }> = []
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { status: 'attempting', attempt_token: 'fence', cancel_requested_at: options.cancelBeforeSend ? new Date().toISOString() : null } }) }
  const db: any = { from: () => query, rpc: async (name: string, args: any) => {
    calls.push({ name, args })
    if (name === 'record_outbound_intent') return { data: options.revoked ? { blocked: true, created: false } : { id: 'i', status: state, created: true, provider_ref: options.providerRef, cancel_requested: options.cancelAtFinish } }
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
test('replaying a sent promise retains its provider receipt and in-flight cancellation', async () => {
  const { db } = fixture({ status: 'sent', providerRef: 'original-mail', cancelAtFinish: true })
  expect(await withOutboundPromise(db, input, async () => { throw Error('must not send') }, ready))
    .toMatchObject({ status: 'sent', providerRef: 'original-mail', cancelRequested: true, receiptConfirmed: true })
})
test('a worker that loses the claim reads the winners actual receipt within the tenant', async () => {
  const filters: unknown[] = []
  const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
    maybeSingle: async () => ({ data: { status: 'sent', provider_ref: 'winner-mail', cancel_requested_at: null } }) }
  const db: any = { from: (table: string) => { expect(table).toBe('outbound_intents'); return query }, rpc: async (name: string) => ({ data: name === 'record_outbound_intent'
    ? { id: 'i', status: 'pending', created: false } : { claimed: [], unknown_ids: [], cancelled_ids: [] } }) }
  expect(await withOutboundPromise(db, input, async () => { throw Error('must not send') }, ready))
    .toMatchObject({ status: 'sent', providerRef: 'winner-mail', receiptConfirmed: true })
  expect(filters).toEqual([['business_id', 'a'], ['id', 'i']])
})
for (const failure of ['missing', 'query-error', 'rejection']) test(`a lost claim with ${failure} does not invent a pending or sent receipt`, async () => {
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => {
    if (failure === 'rejection') throw Error('network')
    return { data: null, error: failure === 'query-error' ? { message: 'read failed' } : null }
  } }
  const db: any = { from: () => query, rpc: async (name: string) => ({ data: name === 'record_outbound_intent'
    ? { id: 'i', status: 'pending', created: false } : { claimed: [], unknown_ids: [], cancelled_ids: [] } }) }
  await expect(readOutboundReceipt(db, 'a', 'i')).rejects.toThrow()
  expect(await withOutboundPromise(db, input, async () => { throw Error('must not send') }, ready))
    .toMatchObject({ status: 'unknown', receiptConfirmed: false })
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

test('a failed defer write is isolated and cannot abort the tenant sweep', async () => {
  let claims = 0
  const alarms: string[] = []
  const db: any = { rpc: async (name: string) => {
    if (name === 'list_owed_outbound_intents') return { data: [{ business_id: 'a', owed: 1, stale: 0 }] }
    if (name === 'claim_outbound_intents') return { data: { claimed: claims++ ? [] : [active], unknown_ids: [], cancelled_ids: [] } }
    if (name === 'defer_outbound_intent') return { error: { message: 'write failed' } }
    throw Error(name)
  } }
  const load = c5Modules({ '@/lib/observability/driftlarm': { rapporteraTystFel: async (_db: unknown, _business: string, key: string) => { alarms.push(key) } } })
  const { sweepOutboundIntents } = load('lib/outbound/sweep.ts')
  const result = await sweepOutboundIntents(db, async () => async () => ({ status: 'sent' }), { preflight: async () => ({ channel: 'sms', ok: false, reason: 'saldo' }), maxPerBusiness: 2 })
  expect(result.errors).toBe(1); expect(result.deferred).toBe(0); expect(alarms).toContain('outbound:defer_failed')
})

test('permanent source errors consume an attempt instead of deferring forever', async () => {
  let claims = 0
  const calls: Array<{ name: string; args: any }> = []
  const db: any = { rpc: async (name: string, args: any) => {
    calls.push({ name, args })
    if (name === 'list_owed_outbound_intents') return { data: [{ business_id: 'a', owed: 1, stale: 0 }] }
    if (name === 'claim_outbound_intents') return { data: { claimed: claims++ ? [] : [active], unknown_ids: [], cancelled_ids: [] } }
    if (name === 'finish_outbound_intent') return { data: { id: active.id, status: 'failed', idempotent: false } }
    throw Error(name)
  } }
  const load = c5Modules({ '@/lib/observability/driftlarm': { rapporteraTystFel: async () => {} } })
  const { sweepOutboundIntents } = load('lib/outbound/sweep.ts')
  const result = await sweepOutboundIntents(db, async () => { throw Error('outbound_source_not_found') }, { preflight: ready, maxPerBusiness: 2 })
  expect(result.errors).toBe(1)
  expect(calls.some(c => c.name === 'defer_outbound_intent')).toBe(false)
  expect(calls.find(c => c.name === 'finish_outbound_intent')?.args).toMatchObject({ p_status: 'failed', p_attempt_token: 'fence' })
})

test('deferred supervised send stays open until sweep delivery closes the audit as success', async () => {
  const auditFinishes: any[] = []
  let claims = 0
  const recovered = { ...active, context: { auditId: 'audit-1' } }
  const db: any = {
    rpc: async (name: string, args: any) => {
      if (name === 'record_autonomy_attempt') return { data: 'audit-1' }
      if (name === 'finish_autonomy_attempt') { auditFinishes.push(args); return { data: true } }
      if (name === 'list_owed_outbound_intents') return { data: [{ business_id: 'a', owed: 1, stale: 0 }] }
      if (name === 'claim_outbound_intents') return { data: { claimed: claims++ ? [] : [recovered], unknown_ids: [], cancelled_ids: [] } }
      if (name === 'finish_outbound_intent') return { data: { id: recovered.id, status: args.p_status, cancel_requested: false, idempotent: false } }
      throw Error(name)
    },
    from: (table: string) => {
      expect(table).toBe('outbound_intents')
      let selected = ''
      const query: any = {
        select: (value: string) => { selected = value; return query },
        eq: () => query,
        maybeSingle: async () => ({ data: { status: 'attempting', attempt_token: 'fence', cancel_requested_at: null }, error: null }),
        then: (resolve: (value: unknown) => void) => resolve(selected === 'id,status,context'
          ? { data: [{ id: recovered.id, status: 'attempting', context: { auditId: 'audit-1' } }], error: null }
          : { data: [], error: null }),
      }
      return query
    },
  }
  const load = c5Modules({
    './earned-autonomy': { isAutonomous: async () => true, AUTONOMY_META: { invoice_reminder: { label: 'fakturapåminnelser' } } },
    './consent-grant': { supervisedAutonomyEnabled: () => true },
    '@/lib/channels/preflight': { gateChannel: ready },
    '@/lib/observability/driftlarm': { rapporteraTystFel: async () => {} },
    './source': { readOutboundSource: async () => ({ message: 'Hej', recipient: 'customer', purpose: 'transactional' }) },
    '@/lib/sms-send': {
      sendPersistedSms: async () => ({ success: true, smsId: 'sms-1', elksId: 'elks-1' }),
      smsProviderOutcome: () => ({ status: 'sent', providerRef: 'elks-1' }),
    },
  })
  const { supervisedSend } = load('lib/autonomy/supervised-send.ts')
  const deferred = { success: false, outboundStatus: 'pending', channelSkipped: true }
  expect(await supervisedSend(db, 'a', 'invoice_reminder', 'sms', async () => deferred, () => 'unknown', deferred, {})).toBe(deferred)
  expect(auditFinishes).toHaveLength(0)

  const { sweepOutboundIntents } = load('lib/outbound/sweep.ts')
  const { resolveOutboundSource } = load('lib/outbound/resolve.ts')
  const result = await sweepOutboundIntents(db, resolveOutboundSource, { preflight: ready, maxPerBusiness: 2 })
  expect(result.attempted).toBe(1)
  expect(auditFinishes).toEqual([expect.objectContaining({ p_id: 'audit-1', p_outcome: 'success', p_channel: 'sms' })])
})

test('canonical source version is stable across key order and refuses tenant or content drift', async () => {
  const envelope: SmsEnvelope = { message: 'Hej', recipient: 'customer', purpose: 'transactional', customerId: 'c' }
  expect(outboundVersion(envelope)).toBe(outboundVersion({ purpose: 'transactional', customerId: 'c', recipient: 'customer', message: 'Hej' }))
  const intent = { ...active, context: { version: outboundVersion(envelope) } }
  const sourceDb = (stored: SmsEnvelope, exists = true) => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => exists ? { data: {
      source: intent.source, source_id: intent.source_id, kind: intent.kind,
      recipient: intent.recipient, template: intent.template, version: intent.context.version, envelope: stored,
    } } : { data: null } }
    return { from: () => query } as any
  }
  expect(await readOutboundSource<any>(sourceDb(envelope), 'a', intent)).toEqual(envelope)
  await expect(readOutboundSource<any>(sourceDb(envelope, false), 'b', intent)).rejects.toThrow('outbound_source_not_found')
  await expect(readOutboundSource<any>(sourceDb({ ...envelope, message: 'Ändrat' }), 'a', intent)).rejects.toThrow('outbound_source_changed')
})

test('partial push acceptance is terminal sent; uncertainty requires zero accepted devices', () => {
  const result = (expo: any, web: any = { attempted: 0, accepted: 0, rejected: 0 }) => ({ delivered: expo.accepted > 0, sent: expo.accepted + web.accepted, channels: { expo, web } })
  expect(pushProviderOutcome(result({ attempted: 2, accepted: 1, rejected: 1, tickets: ['ticket-1'] })))
    .toMatchObject({ status: 'sent', providerRef: 'ticket-1', error: 'Delvis accepterat av notistjänsterna' })
  expect(pushProviderOutcome(result({ attempted: 2, accepted: 2, rejected: 0, tickets: ['a', 'b'] }))).toMatchObject({ status: 'sent' })
  expect(pushProviderOutcome(result({ attempted: 0, accepted: 0, rejected: 0 }))).toMatchObject({ status: 'skipped' })
  expect(pushProviderOutcome(result({ attempted: 1, accepted: 0, rejected: 1, reason: 'network_error' }))).toMatchObject({ status: 'unknown' })
})

test('multi-channel autonomy receipt waits for certainty and succeeds when either channel is sent', () => {
  const rows = [
    { id: 'sms', status: 'attempting', context: { auditId: 'audit' } },
    { id: 'email', status: 'pending', context: { auditId: 'audit' } },
    { id: 'other', status: 'sent', context: { auditId: 'another' } },
  ]
  expect(aggregateAutonomyOutcome(rows, 'sms', 'audit', { status: 'failed' })).toBeNull()
  expect(aggregateAutonomyOutcome(rows, 'sms', 'audit', { status: 'sent' })).toBe('success')
  expect(aggregateAutonomyOutcome(rows.map(row => row.id === 'email' ? { ...row, status: 'skipped' } : row), 'sms', 'audit', { status: 'failed' })).toBe('failed')
})

test('the three provider boundaries and all four supervised actions use durable identities', () => {
  for (const file of ['lib/sms-send.ts', 'lib/email.ts', 'app/api/push/send/route.ts']) {
    const source = readFileSync(file, 'utf8')
    expect(source).toContain('withOutboundSource')
  }
  const actions: Array<[string, string]> = [
    ['invoice_reminder', 'lib/invoice-reminder-send.ts'],
    ['booking_reminder', 'lib/booking-reminders.ts'],
    ['quote_followup_sms', 'app/api/cron/quote-follow-up/route.ts'],
    ['review_request', 'app/api/cron/review-requests/route.ts'],
  ]
  for (const [key, file] of actions) {
    const source = readFileSync(file, 'utf8')
    expect(source).toContain(`autonomyKey`)
    expect(source).toContain('outbound:')
    expect(source).toContain(key)
  }
})

test('rollout fences and durable SMS receipt preserve compatibility', () => {
  const intents = readFileSync('lib/outbound/intents.ts', 'utf8')
  const source = readFileSync('lib/outbound/source.ts', 'utf8')
  const sms = readFileSync('lib/sms-send.ts', 'utf8')
  const push = readFileSync('app/api/push/send/route.ts', 'utf8')
  expect(intents).toContain("process.env.SUPERVISED_AUTONOMY_ENABLED === 'true' ? p.autonomyKey")
  expect(source).toContain("process.env.SUPERVISED_AUTONOMY_ENABLED === 'true' ? p.autonomyKey")
  expect(sms).toContain("if (providerResult) return { ...providerResult, outboundStatus: 'sent' }")
  expect(push).toContain('if (!identity && autonomyRequested)')
})

test('outbound sweep has its own all-tenant budget before financial kernel work', () => {
  const route = readFileSync('app/api/cron/financial-kernel/route.ts', 'utf8')
  expect(route.indexOf('sweepOutboundIntents(sb')).toBeGreaterThan(0)
  expect(route.indexOf('sweepOutboundIntents(sb')).toBeLessThan(route.indexOf('listFinancialKernelWork(db)'))
  expect(route).toContain('Date.now() + 45_000')
})

test('recovered reviewed email restores the tenant-scoped document receipt once', async () => {
  let variables: any = { delivery: { version: 'v1', state: 'sending', attempt: 1 } }
  let writes = 0
  const db: any = { from: (table: string) => {
    expect(table).toBe('generated_document')
    let update: any = null
    const filters: Array<[string, unknown]> = []
    const query: any = {
      select: () => query, update: (value: any) => { update = value; return query },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
      maybeSingle: async () => ({ data: { variables_data: structuredClone(variables) } }),
      then: (resolve: (value: unknown) => void) => {
        expect(filters).toContainEqual(['business_id', 'a'])
        expect(filters).toContainEqual(['variables_data', JSON.stringify(variables)])
        variables = update.variables_data; writes++
        resolve({ data: [{ id: 'doc' }], error: null })
      },
    }
    return query
  } }
  const envelope: any = { subject: 'Rapport', html: '<p>Granskad</p>',
    journal: { type: 'reviewed_document', documentId: 'doc', version: 'v1' } }
  await reviewedDocumentReceipt(db, 'a', envelope, { status: 'sent', providerRef: 'mail-1' })
  expect(writes).toBe(1)
  expect(variables.delivery).toMatchObject({ state: 'accepted', messageId: 'mail-1' })
  await reviewedDocumentReceipt(db, 'a', envelope, { status: 'sent', providerRef: 'mail-1' })
  expect(writes).toBe(1)
})
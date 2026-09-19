import { test, expect } from '@playwright/test'
import { NextRequest } from 'next/server'
import { c5Modules } from './helpers/c5-module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
function impactRoute(
  role: string | null = 'owner',
  enabled = true,
  kernel = true,
  fail = false,
) {
  const calls: any[] = []
  const modules = c5Modules({
    '@/lib/auth': {
      getAuthenticatedBusiness: async () =>
        role ? { business_id: 'trusted' } : null,
    },
    '@/lib/permissions': {
      getCurrentUser: async () => ({ role }),
      isOwnerOrAdmin: (u: any) => ['owner', 'admin'].includes(u.role),
    },
    '@/lib/supabase': { getServerSupabase: () => ({}) },
    '@/lib/value/impact-flags': { impactEnabled: () => enabled },
    '@/lib/value/kernel-evidence': { usesKernelValue: async () => kernel },
    '@/lib/value/impact': {
      getImpact: async (...args: any[]) => {
        calls.push(args)
        if (fail) throw Error('private')
        return { version: 1, business_id: args[1], period: args[2] }
      },
    },
  })
  return { calls, route: modules('app/api/dashboard/impact/route.ts') }
}
for (const role of [null, 'employee', 'project_manager'])
  test(`Impact denies ${role} before reading value`, async () => {
    const h = impactRoute(role)
    expect(
      (await h.route.GET(new NextRequest('https://test?business_id=other')))
        .status,
    ).toBe(role ? 403 : 401)
    expect(h.calls).toEqual([])
  })
test('Impact needs both release and business activation; read errors never become zero', async () => {
  for (const h of [
    impactRoute('owner', false),
    impactRoute('owner', true, false),
  ]) {
    expect((await h.route.GET(new NextRequest('https://test'))).status).toBe(
      404,
    )
    expect(h.calls).toEqual([])
  }
  const h = impactRoute()
  const result = await h.route.GET(
    new NextRequest('https://test?period=2026-09&business_id=other'),
  )
  expect(await result.json()).toMatchObject({
    business_id: 'trusted',
    period: '2026-09',
  })
  expect(result.headers.get('Cache-Control')).toBe('no-store')
  expect(h.calls).toEqual([[{}, 'trusted', '2026-09']])
  const failure = await impactRoute('owner', true, true, true).route.GET(
    new NextRequest('https://test'),
  )
  expect(failure.status).toBe(503)
  expect(JSON.stringify(await failure.json())).not.toContain('private')
})
test('combined Impact refuses a changing monetary snapshot and uses existing read models', async () => {
  const calls: string[] = [],
    ledger = { period: '2026-09' },
    weekly = {},
    receipt = { period: '2026-09' }
  let seq = 0,
    change = false
  const modules = c5Modules({
    './ledger': {
      getManadsLedger: async (...args: any[]) => {
        calls.push('ledger:' + args[3])
        return ledger
      },
    },
    '../weekly-value': {
      getWeeklyValue: async (...args: any[]) => {
        expect(args[3]).toEqual({ failOnReadError: true })
        return weekly
      },
    },
    './vardekvitto': {
      manadsfonster: (p: string) => (p === '2026-09' ? {} : null),
      getVardekvitto: async () => receipt,
    },
    './kernel-evidence': {
      usesKernelValue: async () => true,
      readKernelWatermark: async () => String(change ? ++seq : 1),
    },
  })
  const get = modules('lib/value/impact.ts').getImpact
  const result = await get({}, 'a', '2026-09')
  expect(result).toMatchObject({
    ledger,
    weekly,
    receipt,
    money_source: 'kernel',
  })
  expect(calls).toEqual(['ledger:3'])
  await expect(get({}, 'a', 'invalid')).rejects.toThrow('invalid_impact_period')
  change = true
  await expect(get({}, 'a', '2026-09')).rejects.toThrow(
    'impact_money_changed_during_read',
  )
})
test('kernel reader preserves cents, partial evidence, and rejects mixed snapshots or invalid amounts', async () => {
  const { readKernelInvoiceEvidence, minorToKr } = c5Modules({})(
    'lib/value/kernel-evidence.ts',
  )
  expect(minorToKr('101')).toBe(1.01)
  for (const bad of ['-1', '1.2', 1, '9007199254740992'])
    expect(() => minorToKr(bad)).toThrow()
  const row = {
    invoice_id: 'i',
    currency: 'SEK',
    billed_minor: '100001',
    issued_minor: '100001',
    paid_minor: '0',
    allocated_customer_minor: '40000',
    customer_settled: false,
    paid_at: null,
  }
  const db = {
    rpc: async () => ({
      data: { source: 'kernel', through_seq: '1', invoices: [row] },
      error: null,
    }),
  }
  expect(
    (await readKernelInvoiceEvidence(db, 'a', ['i'])).get('i'),
  ).toMatchObject({ total_kr: 1000.01, paid: false, partial_paid_kr: 400 })
  let call = 0
  const moving = {
    rpc: async () => ({
      data: { source: 'kernel', through_seq: String(++call), invoices: [] },
      error: null,
    }),
  }
  await expect(
    readKernelInvoiceEvidence(
      moving,
      'a',
      Array.from({ length: 101 }, (_, i) => String(i)),
    ),
  ).rejects.toThrow('value_money_changed_during_read')
})
test('partial payments remain invoice evidence and are not added to fully settled totals', () => {
  const modules = c5Modules({})
  const ledger = modules('lib/value/ledger.ts').byggManadsLedger({
    period: '2026-09',
    cards: [
      {
        id: 'c',
        approval_type: 'fakturera_projekt',
        status: 'approved',
        created_at_ms: Date.parse('2026-09-01'),
        resolved_at_ms: Date.parse('2026-09-01'),
        amount_kr: 9999,
        invoice_id: 'i',
        invoice_verified: true,
      },
    ],
    invoices: new Map([
      [
        'i',
        {
          total_kr: 1000,
          paid_kr: 0,
          paid: false,
          paid_at_ms: null,
          partial_paid_kr: 400,
        },
      ],
    ]),
  })
  expect(ledger.fakturerat.kr).toBe(1000)
  expect(ledger.betalt.kr).toBe(0)
  expect(ledger.items[0]).toMatchObject({
    steg: 'fakturerat',
    partial_paid_kr: 400,
  })
  const html = renderToStaticMarkup(
    React.createElement(
      modules('components/value/LedgerRader.tsx').LedgerRader,
      { items: ledger.items },
    ),
  )
  expect(html).toContain('Delbetalt:')
  expect(html).toContain('Räknas inte in i steget Betalt')
})
test('cron projection transport failure does not prevent payment bridge or effect sweep', async () => {
  const calls: string[] = []
  const m = c5Modules({
    '@/lib/cron/verify-secret': { verifyCronSecret: () => true },
    '@/lib/supabase': { getServerSupabase: () => ({}) },
    '@/lib/financial-kernel/kernel-db': { kernelDb: () => ({}) },
    '@/lib/value/events/kernel-consumer': {
      kernelValueEnabled: () => true,
      valueLedgerConsumer: { consumer: 'value-ledger' },
    },
    '@/lib/financial-kernel/events/bridge-automation': {
      automationBridge: { consumer: 'automation-bridge' },
    },
    '@/lib/financial-kernel/events/consume': {
      consumeOnce: async (_db: any, _biz: string, handler: any) => {
        calls.push(handler.consumer)
        if (handler.consumer === 'value-ledger') throw Error('transport lost')
        return { delivered: 1, halted: false }
      },
    },
    '@/lib/financial-kernel/shadow/service': {
      listFinancialKernelWork: async () => [
        { business_id: 'a', consume: true, sweep: true },
      ],
    },
    '@/lib/financial-kernel/commands/service': {
      listOwedEffectIntents: async () => [{ invoice_id: 'i' }],
    },
    '@/lib/financial-kernel/effects/sweep': {
      sweepInvoiceIntents: async () => {
        calls.push('sweep')
        return { effects: [{}], markedUnknown: 0 }
      },
    },
    '@/lib/observability/driftlarm': { rapporteraTystFel: async () => {} },
  })
  const result = await (
    await m('app/api/cron/financial-kernel/route.ts').GET(
      new Request('https://test'),
    )
  ).json()
  expect(calls).toEqual(['automation-bridge', 'sweep', 'value-ledger'])
  expect(result).toMatchObject({ ok: false, consumed: 1, swept: 1 })
})

test('kernel rollout missing config is off, but read failures still fail closed', async () => {
 const { usesKernelValue } = c5Modules({'./events/kernel-consumer': { kernelValueEnabled: () => true }})('lib/value/kernel-evidence.ts')
 let result: any = {data: null, error: null}
 const scopes: unknown[] = []
 const query: any = {select: () => query, eq: (...args: unknown[]) => {scopes.push(args); return query}, maybeSingle: async () => result}
 const db = {from: () => query}
 expect(await usesKernelValue(db, 'own')).toBe(false)
 result = {data: {financial_kernel_enabled: true}, error: null}
 expect(await usesKernelValue(db, 'own')).toBe(true)
 result = {data: null, error: {message: 'unavailable'}}
 await expect(usesKernelValue(db, 'own')).rejects.toThrow('value_kernel_rollout_read_failed')
 expect(scopes).toEqual([['business_id', 'own'], ['business_id', 'own'], ['business_id', 'own']])
})

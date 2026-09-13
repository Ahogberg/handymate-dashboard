import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { loadCustomerMemory, promiseStatusText, type CustomerMemoryFact } from '../lib/customers/customer-memory'

type DbState = { customer?: object | null; customerError?: object | null; facts?: object[]; factsError?: object | null }

function route(state: DbState) {
  const operations: string[] = []
  function query(table: string) {
    const q: any = {
      select(columns: string) { operations.push(`${table}:select:${columns}`); return q },
      eq(column: string, value: unknown) { operations.push(`${table}:eq:${column}:${value}`); return q },
      is(column: string, value: unknown) { operations.push(`${table}:is:${column}:${value}`); return q },
      not(column: string, operator: string, value: unknown) { operations.push(`${table}:not:${column}:${operator}:${value}`); return q },
      order(column: string) { operations.push(`${table}:order:${column}`); return q },
      limit(value: number) { operations.push(`${table}:limit:${value}`); return Promise.resolve({ data: state.facts || [], error: state.factsError || null }) },
      maybeSingle() { return Promise.resolve({ data: state.customer ?? null, error: state.customerError || null }) },
    }
    return q
  }
  const code = ts.transpileModule(readFileSync('app/api/customers/[id]/facts/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const dependencies: Record<string, unknown> = {
    'next/server': { NextResponse },
    '@/lib/auth': { getAuthenticatedBusiness: async () => ({ business_id: 'tenant-a' }) },
    '@/lib/supabase': { getServerSupabase: () => ({ from: query }) },
  }
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', code)((name: string) => dependencies[name], module, module.exports)
  return { get: module.exports.GET as (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>, operations }
}

const fact: CustomerMemoryFact = {
  id: 'fact-1', fact_type: 'commitment', content: 'Vi återkommer på fredag', evidence_quote: 'Jag lovar att återkomma',
  source_type: 'conversation', source_id: 'call-1', created_at: '2026-09-01T10:00:00Z', confirmed_at: '2026-09-02T10:00:00Z',
  due_at: '2026-09-05T10:00:00Z', promise_status: 'open', fulfilled_at: null,
}

test('actual customer facts route fails closed and queries only current confirmed tenant facts', async () => {
  for (const state of [{ customerError: { message: 'db' } }, { customer: { customer_id: 'customer-a' }, factsError: { message: 'db' } }]) {
    const harness = route(state)
    const response = await harness.get(new NextRequest('https://test/api/customers/customer-a/facts'), { params: Promise.resolve({ id: 'customer-a' }) })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Kundminnet kunde inte läsas.' })
  }

  const missing = route({ customer: null })
  const missingResponse = await missing.get(new NextRequest('https://test/api/customers/missing/facts'), { params: Promise.resolve({ id: 'missing' }) })
  expect(missingResponse.status).toBe(404)
  expect(missing.operations.some(value => value.startsWith('customer_fact:'))).toBe(false)

  const harness = route({ customer: { customer_id: 'customer-a' }, facts: [fact] })
  const response = await harness.get(new NextRequest('https://test/api/customers/customer-a/facts'), { params: Promise.resolve({ id: 'customer-a' }) })
  expect(await response.json()).toEqual({ facts: [fact], limited_to: 20 })
  expect(harness.operations).toContain('customer:eq:business_id:tenant-a')
  expect(harness.operations).toContain('customer_fact:eq:business_id:tenant-a')
  expect(harness.operations).toContain('customer_fact:is:superseded_by:null')
  expect(harness.operations).toContain('customer_fact:not:confirmed_at:is:null')
  expect(harness.operations).toContain('customer_fact:limit:20')
  expect(harness.operations.find(value => value.startsWith('customer_fact:select:'))).toContain('promise_status')
})

test('memory loader rejects HTTP and malformed rows and scopes encoded customer reads', async () => {
  const controller = new AbortController()
  let requested = ''
  const result = await loadCustomerMemory('kund / å', controller.signal, async (input, init) => {
    requested = String(input)
    expect(init?.signal).toBe(controller.signal)
    return new Response(JSON.stringify({ facts: [fact], limited_to: 20 }))
  })
  expect(requested).toBe('/api/customers/kund%20%2F%20%C3%A5/facts')
  expect(result).toEqual({ facts: [fact], limit: 20 })
  await expect(loadCustomerMemory('x', controller.signal, async () => new Response('{}', { status: 500 }))).rejects.toThrow('read-failed')
  await expect(loadCustomerMemory('x', controller.signal, async () => new Response(JSON.stringify({ facts: [{ content: 'missing identity' }], limited_to: 20 })))).rejects.toThrow('malformed')
})

test('aborting an old customer read prevents it from becoming a successful memory result', async () => {
  const old = new AbortController()
  let resolveOld!: (response: Response) => void
  const pending = loadCustomerMemory('old', old.signal, () => new Promise(resolve => { resolveOld = resolve }))
  for (let turn = 0; turn < 5 && !resolveOld; turn++) await Promise.resolve()
  old.abort()
  resolveOld(new Response(JSON.stringify({ facts: [fact], limited_to: 20 })))
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  const fresh = new AbortController()
  await expect(loadCustomerMemory('new', fresh.signal, async () => new Response(JSON.stringify({ facts: [fact], limited_to: 20 })))).resolves.toEqual({ facts: [fact], limit: 20 })
  const page = readFileSync('app/dashboard/customers/[id]/page.tsx', 'utf8')
  expect(page).toContain("key={`${business?.business_id || ''}:${customerId}`}")
  const component = readFileSync('components/customers/CustomerMemory.tsx', 'utf8')
  expect(component).toContain('return () => controller.abort()')
})

test('stored commitment states render literally without inferring fulfillment or overdue state', () => {
  expect(promiseStatusText(fact)).toContain('Öppet · senast')
  expect(promiseStatusText({ ...fact, due_at: null })).toBe('Öppet · datum saknas')
  expect(promiseStatusText({ ...fact, promise_status: 'broken' })).toContain('Markerat som brutet')
  expect(promiseStatusText({ ...fact, promise_status: null })).toContain('Status saknas')
  const fulfilled = promiseStatusText({ ...fact, promise_status: 'fulfilled', fulfilled_at: '2026-09-06T10:00:00Z' })
  expect(fulfilled).toContain('Uppfyllt')
  expect(fulfilled).not.toContain('Öppet')
  expect(fulfilled).not.toContain('försenat')
  expect(promiseStatusText({ ...fact, fact_type: 'preference' })).toBeNull()
})

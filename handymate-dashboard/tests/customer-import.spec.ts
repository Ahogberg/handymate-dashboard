import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'

// Actual route, explicit boundary doubles. No network, credentials or real customers.
function harness(responses: Array<{ data?: any; error?: any } | Error> = [], authenticated = true) {
  const queries: any[][] = []
  const syncs: any[] = []
  const db = { from(table: string) {
    const ops: any[] = [['from', table]]
    queries.push(ops)
    const result = responses.shift()
    const q: any = { then(resolve: any, reject: any) {
      if (!result) return Promise.reject(new Error('Unexpected database call')).then(resolve, reject)
      return (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject)
    } }
    for (const method of ['select', 'eq', 'maybeSingle', 'single', 'insert', 'update']) {
      q[method] = (...args: any[]) => { ops.push([method, ...args]); return q }
    }
    return q
  } }
  const mocks: Record<string, any> = {
    'next/server': { NextRequest, NextResponse },
    '@/lib/auth': { getAuthenticatedBusiness: async () => authenticated ? { business_id: 'biz_a' } : null },
    '@/lib/supabase': { getServerSupabase: () => db },
    '@/lib/numbering': { getNextCustomerNumber: async () => 'K-1001' },
    '@/lib/fortnox/sync': { batchSync: async (...args: any[]) => { syncs.push(args) } },
  }
  const code = ts.transpileModule(readFileSync('app/api/customers/import/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports: any = {}
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in mocks)) throw new Error(`Unmocked import: ${id}`)
    return mocks[id]
  }, exports)
  return {
    queries, syncs,
    async post(body: any) {
      const response = await exports.POST(new NextRequest('https://test/api/customers/import', {
        method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
      }))
      return { status: response.status, body: await response.json() }
    },
  }
}

const row = { name: 'Testkund', phone_number: '+46700000000' }
const found = { data: { customer_id: 'cust_a' }, error: null }
const absent = { data: null, error: null }

test('anonymous rejected before any data access', async () => {
  const h = harness([], false)
  expect((await h.post({ customers: [row] })).status).toBe(401)
  expect(h.queries).toEqual([])
})

for (const payload of ['{invalid', null, {}, { customers: [] }, { customers: 'bad' }, { customers: Array(5001).fill(row) }]) {
  test(`invalid body rejected: ${JSON.stringify(payload).slice(0, 65)}`, async () => {
    const h = harness()
    expect((await h.post(payload)).status).toBe(400)
    expect(h.queries).toEqual([])
  })
}

test('returned update error is failed, never success or imported ID', async () => {
  const h = harness([found, { data: null, error: { message: 'private DB detail' } }])
  const { body } = await h.post({ customers: [row] })
  expect(body).toMatchObject({ success: 0, failed: 1, updated: 0, importedIds: [], total: 1 })
  expect(body.errors).toHaveLength(1)
  expect(body.errors[0]).toContain('Rad 1')
  expect(JSON.stringify(body)).not.toContain('private DB detail')
  expect(h.syncs).toEqual([])
})

test('zero affected update rows is not a saved customer', async () => {
  const h = harness([found, absent])
  expect((await h.post({ customers: [row] })).body).toMatchObject({ success: 0, failed: 1, importedIds: [] })
})

test('failed lookup never falls through into a duplicate insert', async () => {
  const h = harness([{ data: null, error: { code: 'PGRST116' } }])
  expect((await h.post({ customers: [row] })).body).toMatchObject({ success: 0, failed: 1 })
  expect(h.queries).toHaveLength(1)
  expect(h.queries.flat().some(op => op[0] === 'insert')).toBe(false)
})

test('successful update has tenant filter and actual returned row', async () => {
  const h = harness([found, found])
  const { body } = await h.post({ customers: [row], business_id: 'foreign' })
  expect(body).toMatchObject({ success: 1, updated: 1, created: 0, failed: 0, importedIds: ['cust_a'] })
  for (const query of h.queries) expect(query).toContainEqual(['eq', 'business_id', 'biz_a'])
  expect(h.queries[1]).toContainEqual(['select', 'customer_id'])
  expect(h.syncs).toEqual([['biz_a', 'customer']])
})

test('insert uses authenticated business, not supplied tenant or ID', async () => {
  const h = harness([absent, found])
  const { body } = await h.post({ customers: [{ ...row, business_id: 'foreign', customer_id: 'foreign_id' }] })
  expect(body).toMatchObject({ created: 1, success: 1, failed: 0 })
  const payload = h.queries[1].find(op => op[0] === 'insert')[1]
  expect(payload.business_id).toBe('biz_a')
  expect(payload.customer_id).not.toBe('foreign_id')
})

test('insert failure and empty insert result do not count as success', async () => {
  for (const result of [absent, { data: null, error: { message: 'rejected' } }]) {
    const h = harness([absent, result])
    expect((await h.post({ customers: [row] })).body).toMatchObject({ success: 0, created: 0, failed: 1 })
  }
})

test('phone-only existing row is unchanged, no write or sync', async () => {
  const h = harness([found])
  expect((await h.post({ customers: [{ phone_number: row.phone_number }] })).body)
    .toMatchObject({ success: 1, unchanged: 1, created: 0, updated: 0, failed: 0 })
  expect(h.queries).toHaveLength(1)
  expect(h.syncs).toEqual([])
})

test('skip existing is checked server-side and never writes', async () => {
  const h = harness([found])
  expect((await h.post({ customers: [row], skip_existing: true })).body)
    .toMatchObject({ skipped: 1, success: 0, failed: 0, importedIds: [] })
  expect(h.queries).toHaveLength(1)
})

test('invalid rows get stable row numbers, later valid rows continue', async () => {
  const h = harness([absent, found])
  const { body } = await h.post({ customers: [null, { name: 42 }, {}, row] })
  expect(body).toMatchObject({ total: 4, success: 1, created: 1, failed: 3 })
  expect(body.errors.map((s: string) => s.split(':')[0])).toEqual(['Rad 1', 'Rad 2', 'Rad 3'])
})

test('mixed batch counts every row and returns unique successful IDs only', async () => {
  const h = harness([found, found, found, found, absent, { data: null, error: { message: 'no' } }])
  const { body } = await h.post({ customers: [row, row, row] })
  expect(body).toMatchObject({ total: 3, success: 2, updated: 2, failed: 1, importedIds: ['cust_a'] })
  expect(body.created + body.updated + body.unchanged + body.skipped + body.failed).toBe(body.total)
  expect(h.syncs).toHaveLength(1)
})

test('thrown database failure stays visible and does not abort later rows', async () => {
  const h = harness([new Error('network'), found, found])
  const { body } = await h.post({ customers: [row, row] })
  expect(body).toMatchObject({ success: 1, failed: 1 })
  expect(body.errors[0]).toContain('Rad 1')
})

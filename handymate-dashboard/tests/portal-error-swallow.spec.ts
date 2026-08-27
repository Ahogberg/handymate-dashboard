import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { getCustomerFromPortalToken } from '../lib/portal-link'

const ROOT = path.resolve(__dirname, '..')

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

// TD-22 (tasks/tech-debt.md): fem portal-routes destrukturerade bara
// `{ data }` från Supabase och kollade aldrig `error` — ett kolumnnamnsfel
// (bevisat: /projects läste `progress` i stället för `progress_percent`,
// PostgREST 42703) gav `data=null` → `[] || []` → HTTP 200 med tom lista,
// helt tyst i loggarna. /projects fixades redan; de fem andra hade samma
// anti-pattern kvar.

function fakeSupabaseSingle(result: { data: any; error: any }) {
  const calls: Array<{ select: string; eq: [string, string][] }> = []
  return {
    calls,
    client: {
      from() {
        const eqCalls: [string, string][] = []
        let selectArg = ''
        const query: any = {
          select(s: string) { selectArg = s; return query },
          eq(col: string, val: string) { eqCalls.push([col, val]); return query },
          single() {
            calls.push({ select: selectArg, eq: eqCalls })
            return Promise.resolve(result)
          },
        }
        return query
      },
    } as any,
  }
}

test.describe('getCustomerFromPortalToken — den konsoliderade uppslags-helpern', () => {
  test('lyckat uppslag med portal_enabled=true returnerar kunden', async () => {
    const fake = fakeSupabaseSingle({
      data: { customer_id: 'c1', business_id: 'b1', portal_enabled: true },
      error: null,
    })
    const result = await getCustomerFromPortalToken(fake.client, 'tok_1')
    expect(result).toMatchObject({ customer_id: 'c1', business_id: 'b1' })
  })

  test('portal_enabled=false returnerar null (avstängd länk)', async () => {
    const fake = fakeSupabaseSingle({
      data: { customer_id: 'c1', business_id: 'b1', portal_enabled: false },
      error: null,
    })
    const result = await getCustomerFromPortalToken(fake.client, 'tok_1')
    expect(result).toBeNull()
  })

  test('ogiltig/okänd token (ingen rad) returnerar null', async () => {
    const fake = fakeSupabaseSingle({ data: null, error: { code: 'PGRST116', message: 'no rows' } })
    const result = await getCustomerFromPortalToken(fake.client, 'tok_okand')
    expect(result).toBeNull()
  })

  test('ett genuint DB-fel loggas (inte tyst) och ger ändå null — inte en krasch', async () => {
    const logs: any[] = []
    const originalError = console.error
    console.error = (...args: any[]) => { logs.push(args) }
    try {
      const fake = fakeSupabaseSingle({ data: null, error: { code: '42703', message: 'column does not exist' } })
      const result = await getCustomerFromPortalToken(fake.client, 'tok_1')
      expect(result).toBeNull()
      expect(logs.some(l => JSON.stringify(l).includes('42703'))).toBe(true)
    } finally {
      console.error = originalError
    }
  })

  test('ett custom select-argument skickas vidare (messages-routen behöver name+phone_number)', async () => {
    const fake = fakeSupabaseSingle({
      data: { customer_id: 'c1', business_id: 'b1', portal_enabled: true, name: 'Anna' },
      error: null,
    })
    await getCustomerFromPortalToken(fake.client, 'tok_1', 'customer_id, business_id, portal_enabled, name, phone_number')
    expect(fake.calls[0].select).toContain('phone_number')
  })
})

const PORTAL_TOKEN_ROUTES = [
  'app/api/portal/[token]/projects/route.ts',
  'app/api/portal/[token]/activity/route.ts',
  'app/api/portal/[token]/invoices/route.ts',
  'app/api/portal/[token]/messages/route.ts',
  'app/api/portal/[token]/quotes/route.ts',
  'app/api/portal/[token]/reports/route.ts',
  'app/api/portal/[token]/jobbpass/route.ts',
  'app/api/portal/[token]/documents/route.ts',
]

test.describe('konsolidering (Sweep A) — inga kvarvarande dubblettimplementationer', () => {
  for (const routePath of PORTAL_TOKEN_ROUTES) {
    test(`${routePath} importerar den delade helpern, definierar inte sin egen`, () => {
      const src = source(routePath)
      expect(src).toContain("getCustomerFromPortalToken")
      expect(src).toContain("from '@/lib/portal-link'")
      expect(src).not.toMatch(/async function getCustomerFromToken/)
    })
  }
})

const PRIMARY_QUERY_ROUTES = [
  { path: 'app/api/portal/[token]/invoices/route.ts', table: "'invoice'" },
  { path: 'app/api/portal/[token]/messages/route.ts', table: "'customer_message'" },
  { path: 'app/api/portal/[token]/quotes/route.ts', table: "'quotes'" },
  { path: 'app/api/portal/[token]/reports/route.ts', table: "'field_reports'" },
]

test.describe('Sweep B — primärfrågan i varje route kollar error och svarar 500, aldrig en tyst tom lista', () => {
  for (const { path: routePath, table } of PRIMARY_QUERY_ROUTES) {
    test(`${routePath}: frågan mot ${table} destrukturerar error och har en 500-gren`, () => {
      const src = source(routePath)
      const tableCallIndex = src.indexOf(`.from(${table})`)
      expect(tableCallIndex, `hittade inte .from(${table}) i ${routePath}`).toBeGreaterThan(-1)

      // Deklarationen strax före .from(...)-anropet ska destrukturera error
      const declStart = src.lastIndexOf('const {', tableCallIndex)
      const declSlice = src.slice(declStart, tableCallIndex)
      expect(declSlice, `${routePath} destrukturerar inte error på huvudfrågan`).toMatch(/error:\s*\w+Error/)

      // Och en if-gren strax efter som svarar 500
      const afterQuery = src.slice(tableCallIndex, tableCallIndex + 1500)
      expect(afterQuery, `${routePath} saknar en 500-gren efter huvudfrågan`).toMatch(/status:\s*500/)
    })
  }
})

test.describe('activity-routens Promise.all-resultat loggas vid fel (aggregerad feed — best-effort, inte hård 500)', () => {
  test('varje delfråga i Promise.all loggas om den failar', () => {
    const src = source('app/api/portal/[token]/activity/route.ts')
    const promiseAllIndex = src.indexOf('await Promise.all([')
    expect(promiseAllIndex).toBeGreaterThan(-1)
    const afterPromiseAll = src.slice(promiseAllIndex)
    expect(afterPromiseAll).toMatch(/res(?: as any)?\)?\??\.error/)
    expect(afterPromiseAll).toMatch(/console\.error/)
  })
})
